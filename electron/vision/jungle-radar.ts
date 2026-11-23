import { desktopCapturer, nativeImage, screen } from 'electron';
import { appLog } from '../app-log';
import type { LcuConnector } from '../lcu/connector';
import { lanePosition } from '../overlay/lanes';
import { fetchRawGameData, type RawGameData } from '../overlay/live-client';
import type { MapBox, Team } from './camp-detector';
import { findMapBox } from './camp-detector';
import {
  buildChampionTemplate,
  detectJunglerInMinimap,
  type ChampionTemplate,
  type JungleRadarState,
  type RadarPoint,
} from './jungle-radar-detector';
import { isBlack, minimapRegion, readMinimapLayout, type MinimapLayout } from './screen-vision';

const POLL_MS = 2_000;
const IN_GAME = new Set(['InProgress', 'Reconnect']);
const GAME_WINDOW_NAME = 'League of Legends (TM) Client';
const MAX_BLACK_STREAK = 3;
const MAX_TRAIL = 3;

const EMPTY_STATE: JungleRadarState = {
  active: false,
  black: false,
  championKey: null,
  championName: null,
  lastSeen: null,
  trail: [],
};

let cachedDdVersion: { version: string; at: number } | null = null;
async function ddragonVersion(): Promise<string> {
  if (cachedDdVersion && Date.now() - cachedDdVersion.at < 3 * 3600_000) return cachedDdVersion.version;
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const list = (await res.json()) as string[];
      if (Array.isArray(list) && typeof list[0] === 'string') {
        cachedDdVersion = { version: list[0], at: Date.now() };
        return list[0];
      }
    }
  } catch {
    // fallback abaixo
  }
  return cachedDdVersion?.version ?? '15.22.1';
}

function championKeyFromRaw(rawChampionName: string | undefined, championName: string): string {
  const fromRaw = (rawChampionName ?? '').replace(/^game_character_displayname_/i, '');
  return fromRaw || championName.replace(/[^A-Za-z0-9]/g, '');
}

async function fetchTemplate(version: string, championKey: string, isJungler: boolean): Promise<ChampionTemplate | null> {
  try {
    const url = `https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/img/champion/${encodeURIComponent(championKey)}.png`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()));
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    return buildChampionTemplate(img.toBitmap(), width, height, championKey, isJungler, 16, 'bgra');
  } catch {
    return null;
  }
}

/**
 * Controlador leve do Radar Visual do Jungler Inimigo (Nível 2):
 * captura somente a janela do LoL a cada 2 s (1280×720), recorta o canto do minimapa
 * conforme `Config/game.cfg` (resolução, escala 0..3 e lado esquerdo/direito), acha a
 * moldura real do mapa e identifica onde o Jungler inimigo apareceu via NCC local.
 */
export class JungleRadarController {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private preparedGame = false;
  private unsupportedMode = false;
  private blackStreak = 0;
  private layout: MinimapLayout | null = null;
  private cachedBox: MapBox | null = null;
  private myTeam: Team | null = null;
  private templates: ChampionTemplate[] = [];
  private state: JungleRadarState = { ...EMPTY_STATE };

  constructor(
    private readonly connector: LcuConnector,
    private readonly enabled: () => boolean,
    private readonly onUpdate: (state: JungleRadarState) => void,
  ) {
    connector.on('state', () => this.sync());
  }

  getState(): JungleRadarState {
    return { ...this.state, trail: [...this.state.trail] };
  }

  sync(): void {
    const inGame = IN_GAME.has(this.connector.getState().gameflowPhase ?? '');
    const want = inGame && this.enabled();
    if (!inGame) this.reset();
    if (want && !this.timer && !this.state.black && !this.unsupportedMode) {
      this.timer = setInterval(() => void this.tick(), POLL_MS);
      this.timer.unref();
      void this.tick();
    } else if (!want && this.timer) {
      this.stopTimer();
      if (!inGame) return;
      this.setState({ ...this.state, active: false });
    }
  }

  dispose(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private reset(): void {
    this.stopTimer();
    const hadData = this.preparedGame || this.state.active || !!this.state.lastSeen || this.state.black;
    this.preparedGame = false;
    this.unsupportedMode = false;
    this.blackStreak = 0;
    this.layout = null;
    this.cachedBox = null;
    this.myTeam = null;
    this.templates = [];
    this.state = { ...EMPTY_STATE };
    if (hadData) this.onUpdate(this.getState());
  }

  private setState(next: JungleRadarState): void {
    this.state = next;
    this.onUpdate(this.getState());
  }

  private async prepare(raw: RawGameData): Promise<boolean> {
    const mapNumber = raw.gameData?.mapNumber ?? 11;
    const mode = (raw.gameData?.gameMode ?? '').toUpperCase();
    if (mapNumber !== 11 || /^(ARAM|KIWI|CHERRY|STRAWBERRY)$/i.test(mode)) {
      this.unsupportedMode = true;
      this.stopTimer();
      return false;
    }

    const meId = raw.activePlayer?.riotId ?? raw.activePlayer?.summonerName;
    const mine = raw.allPlayers.find((p) => (p.riotId ?? p.summonerName) === meId);
    if (!mine) return false;
    this.myTeam = mine.team === 'CHAOS' ? 'CHAOS' : 'ORDER';

    const enemies = raw.allPlayers.filter((p) => p.team !== mine.team);
    if (!enemies.length) return false;

    const jungler =
      enemies.find((p) => lanePosition(p.position) === 'JUNGLE') ??
      enemies.find((p) => {
        const s1 = p.summonerSpells?.summonerSpellOne?.rawDisplayName ?? '';
        const s2 = p.summonerSpells?.summonerSpellTwo?.rawDisplayName ?? '';
        return /Smite/i.test(s1) || /Smite/i.test(s2);
      }) ??
      null;

    if (!jungler) {
      this.unsupportedMode = true;
      this.stopTimer();
      return false;
    }

    this.layout = await readMinimapLayout(this.connector.getCredentials()?.installDirectory ?? null);
    const ver = await ddragonVersion();
    const loaded = await Promise.all(
      enemies.map((e) => {
        const key = championKeyFromRaw(e.rawChampionName, e.championName);
        return fetchTemplate(ver, key, e === jungler);
      }),
    );
    this.templates = loaded.filter((t): t is ChampionTemplate => !!t);
    const jgKey = championKeyFromRaw(jungler.rawChampionName, jungler.championName);
    if (!this.templates.some((t) => t.isJungler)) return false;

    this.preparedGame = true;
    this.setState({
      active: true,
      black: false,
      championKey: jgKey,
      championName: jungler.championName,
      lastSeen: null,
      trail: [],
    });
    appLog(`radar-jg: ativo contra ${jungler.championName} (${this.templates.length} templates carregados)`);
    return true;
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.enabled() || this.state.black || this.unsupportedMode) return;
    this.busy = true;
    try {
      const raw = await fetchRawGameData().catch(() => null);
      if (!raw?.allPlayers?.length) return;
      if (!this.preparedGame) {
        const ok = await this.prepare(raw);
        if (!ok) return;
      }
      if (!this.myTeam || !this.layout || !this.templates.length) return;

      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });
      const primaryId = String(screen.getPrimaryDisplay().id);
      const gameSource =
        sources.find((s) => s.name === GAME_WINDOW_NAME) ??
        sources.find((s) => s.id.startsWith('window:') && /League of Legends/i.test(s.name) && !/Rift/i.test(s.name)) ??
        sources.find((s) => s.display_id === primaryId) ??
        sources.find((s) => s.id.startsWith('screen:')) ??
        sources[0];
      const thumb = gameSource?.thumbnail;
      if (!thumb || thumb.isEmpty()) return;

      const { width, height } = thumb.getSize();
      if (width < 320 || height < 240) return;

      const region = minimapRegion(this.layout, width, height);
      const crop = thumb.crop(region);
      const { width: cw, height: ch } = crop.getSize();
      const bgra = crop.toBitmap();

      if (isBlack(bgra, cw, ch)) {
        this.blackStreak++;
        if (this.blackStreak >= MAX_BLACK_STREAK) {
          appLog('radar-jg: captura veio preta 3x (jogo em tela cheia exclusiva); pausando captura');
          this.stopTimer();
          this.setState({ ...this.state, active: false, black: true });
        }
        return;
      }
      this.blackStreak = 0;

      const detectedBox = findMapBox(bgra, cw, ch);
      if (detectedBox) this.cachedBox = detectedBox;
      const box: MapBox =
        detectedBox ??
        this.cachedBox ?? {
          left: Math.round(cw * 0.14),
          top: Math.round(ch * 0.14),
          size: Math.round(cw * 0.78),
        };

      const gameTime = raw.gameData?.gameTime ?? 0;
      const hit = detectJunglerInMinimap(bgra, cw, ch, box, this.templates, this.myTeam, gameTime, 'bgra');
      if (!hit) return;

      const trail = appendTrail(this.state.trail, hit);
      this.setState({
        ...this.state,
        active: true,
        black: false,
        lastSeen: hit,
        trail,
      });
    } catch (error) {
      appLog(`radar-jg: erro: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.busy = false;
    }
  }
}

export function appendTrail(current: RadarPoint[], hit: RadarPoint): RadarPoint[] {
  const last = current[current.length - 1];
  if (!last) return [hit];
  const dist = Math.hypot(hit.u - last.u, hit.v - last.v);
  if (dist < 0.06 && hit.gameTime - last.gameTime < 15) {
    return [...current.slice(0, -1), hit];
  }
  return [...current, hit].slice(-MAX_TRAIL);
}
