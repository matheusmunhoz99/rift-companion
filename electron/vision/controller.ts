import { nativeImage } from 'electron';
import path from 'node:path';
import { appLog } from '../app-log';
import type { LcuConnector } from '../lcu/connector';
import { fetchRawGameData } from '../overlay/live-client';
import type { JungleTimings } from '../overlay/live-dashboard';
import { AutoJungle, type OcrCrop } from './auto-jungle';
import type { Team } from './camp-detector';
import { captureMinimap, isBlack, minimapRegion, readMinimapLayout, saveSample, type MinimapCapture, type MinimapLayout } from './screen-vision';
import { MinimapStream, type StreamFrame } from './stream';

const SAMPLE_EVERY_MS = 15_000;
const GAME_POLL_MS = 1_000;
const IN_GAME = new Set(['InProgress', 'Reconnect']);

export interface VisionStatus {
  /** Última captura: null = ainda não capturou nesta partida; true = veio preta (tela cheia exclusiva). */
  black: boolean | null;
  /** Amostras gravadas nesta partida. */
  samples: number;
  folder: string;
  /** Campos marcados sozinhos pela tela nesta partida. */
  autoCamps: number;
}

export interface VisionPrefs {
  screenVision: boolean;
  visionSamples: boolean;
  autoJungle: boolean;
}

/** RGBA (canvas) para BGRA (nativeImage do Windows). */
function toBgra(rgba: Buffer): Buffer {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgba[i + 2];
    out[i + 2] = rgba[i];
  }
  return out;
}

function jpegOf(rgba: Buffer, width: number, height: number, scale = 1, quality = 82): Buffer {
  let image = nativeImage.createFromBitmap(toBgra(rgba), { width, height });
  if (scale !== 1) image = image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' });
  return image.toJPEG(quality);
}

/**
 * Visão da tela durante a partida: um quadro por segundo do canto do minimapa. Serve para
 * (1) marcar sozinho os campos da selva lendo os timers que o LoL desenha no minimapa,
 * (2) mandar o minimapa junto na leitura da IA e (3) gravar amostras, se você quiser.
 * Só o recorte do minimapa é usado; o resto da tela não sai do PC.
 */
export class VisionController {
  private stream: MinimapStream;
  private layout: MinimapLayout | null = null;
  private gameKey: string | null = null;
  private status: VisionStatus;
  private latest: StreamFrame | null = null;
  private lastSample = 0;
  private game: { time: number; at: number; team: Team | null } = { time: 0, at: 0, team: null };
  private gamePoll: NodeJS.Timeout | null = null;
  private jungle: AutoJungle;
  private timings: JungleTimings | null = null;

  constructor(
    private readonly connector: LcuConnector,
    private readonly samplesDirectory: string,
    private readonly prefs: () => VisionPrefs,
    private readonly ocr: (crops: Array<{ id: string; jpeg: string }>) => Promise<Array<{ id: string; text: string | null }> | null>,
    private readonly onCamp: (key: string, backAt: number, exact: boolean) => void,
    private readonly jungleTimings: () => Promise<JungleTimings>,
  ) {
    this.status = { black: null, samples: 0, folder: samplesDirectory, autoCamps: 0 };
    this.stream = new MinimapStream((frame) => void this.onFrame(frame));
    this.jungle = new AutoJungle({
      ocr: (crops: OcrCrop[]) => this.ocr(crops.map((c) => ({ id: c.id, jpeg: jpegOf(c.rgba, c.width, c.height, 3, 92).toString('base64') }))),
      emit: (key, backAt, exact) => {
        this.status.autoCamps++;
        appLog(`visão: ${key} volta aos ${Math.floor(backAt / 60)}:${String(backAt % 60).padStart(2, '0')}${exact ? '' : ' (aprox.)'}`);
        this.onCamp(key, backAt, exact);
      },
      respawnOf: (key) => this.respawnOf(key),
    });
    connector.on('state', () => this.sync());
  }

  getStatus(): VisionStatus {
    return { ...this.status };
  }

  sync(): void {
    const inGame = IN_GAME.has(this.connector.getState().gameflowPhase ?? '');
    const { screenVision, visionSamples, autoJungle } = this.prefs();
    const want = inGame && (screenVision || visionSamples || autoJungle);
    if (!inGame && this.gameKey !== null) {
      this.gameKey = null;
      this.layout = null;
      this.latest = null;
      this.jungle.reset();
      this.status = { black: null, samples: 0, folder: this.samplesDirectory, autoCamps: 0 };
    }
    if (want && !this.stream.running) void this.start();
    else if (!want && this.stream.running) this.stop();
  }

  private async start(): Promise<void> {
    try {
      this.layout ??= await readMinimapLayout(this.connector.getCredentials()?.installDirectory ?? null);
      this.timings = await this.jungleTimings().catch(() => null);
      const layout = this.layout;
      await this.stream.start((w, h) => minimapRegion(layout, w, h));
      this.gamePoll ??= setInterval(() => void this.pollGame(), GAME_POLL_MS);
      void this.pollGame();
    } catch (error) {
      appLog(`visão: não deu para começar a captura: ${error instanceof Error ? error.message : error}`);
    }
  }

  private stop(): void {
    this.stream.stop();
    if (this.gamePoll) clearInterval(this.gamePoll);
    this.gamePoll = null;
  }

  /** Tempo de jogo e o seu time (para saber qual selva é a sua). */
  private async pollGame(): Promise<void> {
    const raw = (await fetchRawGameData().catch(() => null)) as {
      gameData?: { gameTime?: number };
      activePlayer?: { riotId?: string; summonerName?: string };
      allPlayers?: Array<{ riotId?: string; summonerName?: string; team?: string }>;
    } | null;
    const time = raw?.gameData?.gameTime;
    if (typeof time !== 'number') return;
    const me = raw?.activePlayer?.riotId ?? raw?.activePlayer?.summonerName;
    const team = raw?.allPlayers?.find((p) => (p.riotId ?? p.summonerName) === me)?.team;
    this.game = { time, at: Date.now(), team: team === 'ORDER' || team === 'CHAOS' ? team : this.game.team };
    this.gameKey ??= new Date(Date.now() - time * 1000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  }

  /** Tempo de jogo no instante do quadro (o jogo não pausa). */
  private gameTimeAt(at: number): number | null {
    return this.game.at ? this.game.time + (at - this.game.at) / 1000 : null;
  }

  private async onFrame(frame: StreamFrame): Promise<void> {
    this.latest = frame;
    const black = isBlack(frame.rgba, frame.width, frame.height);
    if (black !== this.status.black) {
      appLog(black ? 'visão: a captura veio preta (jogo em tela cheia exclusiva?)' : 'visão: captura do minimapa funcionando');
      this.status.black = black;
    }
    if (black) return;
    const gameTime = this.gameTimeAt(frame.at);
    if (gameTime === null) return;
    const { visionSamples, autoJungle } = this.prefs();
    if (visionSamples && this.gameKey && frame.at - this.lastSample >= SAMPLE_EVERY_MS) {
      this.lastSample = frame.at;
      const capture = { jpeg: jpegOf(frame.rgba, frame.width, frame.height), black, at: frame.at };
      if (saveSample(this.samplesDirectory, this.gameKey, gameTime, capture)) this.status.samples++;
    }
    if (autoJungle && this.game.team) {
      await this.jungle.frame(frame.rgba, frame.width, frame.height, gameTime, this.game.team).catch((error) => {
        appLog(`visão: falha na selva automática: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  private respawnOf(key: string): number {
    const t = this.timings ?? { buffRespawn: 300, campRespawn: 135, scuttleRespawn: 150 };
    const id = key.split(':')[1];
    if (id === 'blue' || id === 'red') return t.buffRespawn;
    if (id?.startsWith('scuttle')) return t.scuttleRespawn;
    return t.campRespawn;
  }

  /** Recorte do minimapa agora (para a leitura da IA); null fora da partida ou com a opção desligada. */
  async minimap(): Promise<MinimapCapture | null> {
    if (!this.prefs().screenVision || !IN_GAME.has(this.connector.getState().gameflowPhase ?? '')) return null;
    const frame = this.latest;
    if (frame && Date.now() - frame.at < 3_000) {
      const black = isBlack(frame.rgba, frame.width, frame.height);
      return { jpeg: jpegOf(frame.rgba, frame.width, frame.height), black, at: frame.at };
    }
    // Sem a captura contínua (acabou de começar): um print só do canto.
    try {
      this.layout ??= await readMinimapLayout(this.connector.getCredentials()?.installDirectory ?? null);
      return await captureMinimap(this.layout);
    } catch {
      return null;
    }
  }

  folder(): string {
    return this.gameKey ? path.join(this.samplesDirectory, this.gameKey) : this.samplesDirectory;
  }
}
