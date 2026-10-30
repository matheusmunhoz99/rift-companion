import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LcuConnector } from './connector';
import { lcuRequest } from './http';
import type { PostGame, PostGameService } from './postgame';

export type RankedQueue = 'solo' | 'flex';

/** Uma partida ranqueada registrada: o quanto de PDL mudou e o resultado. */
export interface RankEntry {
  at: number;
  queue: RankedQueue;
  tier: string;
  division: string;
  lp: number;
  /** Variação de PDL em relação à partida anterior (sobe/desce de divisão já contabilizado). */
  lpChange: number;
  win: boolean | null;
  championId: number;
  /** Subiu ou caiu de divisão/elo nesta partida. */
  note: 'promo' | 'demote' | null;
}

interface Snapshot {
  ladder: number;
  games: number;
  tier: string;
  division: string;
  lp: number;
}

interface Stored {
  baselines: Partial<Record<RankedQueue, Snapshot>>;
  entries: RankEntry[];
}

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX_START = TIERS.indexOf('MASTER') * 400;
const QUEUE_BY_ID: Record<number, RankedQueue> = { 420: 'solo', 440: 'flex' };
const QUEUE_KEY: Record<RankedQueue, string> = { solo: 'RANKED_SOLO_5x5', flex: 'RANKED_FLEX_SR' };
/** Depois do fim da partida, o PDL demora alguns segundos: tenta por ~40 s. */
const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 2_000;
const MAX_ENTRIES = 1_000;

/** Elo em pontos absolutos (400 por tier, 100 por divisão; Mestre+ soma o PDL direto). null se inválido. */
export function ladderValue(tier: string, division: string, lp: number): number | null {
  const t = TIERS.indexOf((tier ?? '').toUpperCase());
  if (t < 0) return null;
  if (t * 400 >= APEX_START) return APEX_START + Math.max(0, lp);
  const d = Math.max(DIVISIONS.indexOf((division ?? '').toUpperCase()), 0);
  return t * 400 + d * 100 + Math.min(Math.max(lp, 0), 100);
}

interface RawQueueStats {
  tier?: string;
  division?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
}

/** Lê o elo de uma fila do current-ranked-stats (formato queueMap do cliente). */
export function queueSnapshot(raw: unknown, queue: RankedQueue): Snapshot | null {
  const map = (raw as { queueMap?: Record<string, RawQueueStats> } | null)?.queueMap;
  const q = map?.[QUEUE_KEY[queue]];
  if (!q || !q.tier || !TIERS.includes(q.tier.toUpperCase())) return null;
  const ladder = ladderValue(q.tier, q.division ?? '', q.leaguePoints ?? 0);
  if (ladder === null) return null;
  return {
    ladder,
    games: (q.wins ?? 0) + (q.losses ?? 0),
    tier: q.tier.toUpperCase(),
    division: (q.division ?? '').toUpperCase(),
    lp: q.leaguePoints ?? 0,
  };
}

/** Compara dois snapshots: 'promo' se subiu de divisão/elo, 'demote' se caiu, senão null. */
export function rankMove(before: Snapshot, after: Snapshot): 'promo' | 'demote' | null {
  const beforeStep = TIERS.indexOf(before.tier) * 4 + Math.max(DIVISIONS.indexOf(before.division), 0);
  const afterStep = TIERS.indexOf(after.tier) * 4 + Math.max(DIVISIONS.indexOf(after.division), 0);
  if (afterStep > beforeStep) return 'promo';
  if (afterStep < beforeStep) return 'demote';
  return null;
}

/**
 * Registra o PDL depois de cada partida ranqueada, lido do próprio cliente (sem
 * custo de API). Guarda por conta em disco; a tela de Progresso mostra a sessão
 * do dia, a evolução e avisa quando vêm derrotas seguidas.
 */
export class RankTracker extends EventEmitter<{ updated: [string] }> {
  private data = new Map<string, Stored>();
  private seeded = new Set<string>();

  constructor(
    private readonly connector: LcuConnector,
    postGame: PostGameService,
    private readonly directory: string,
  ) {
    super();
    connector.on('state', () => void this.seed());
    postGame.on('ready', (game) => void this.onGame(game));
  }

  async history(puuid: string): Promise<RankEntry[]> {
    return (await this.load(puuid)).entries;
  }

  /** Ao conectar, fixa o elo atual como base (partidas jogadas com o app fechado não contam). */
  private async seed(): Promise<void> {
    const puuid = this.connector.getState().summoner?.puuid;
    if (!puuid || this.seeded.has(puuid)) return;
    const raw = await this.readRankedStats();
    if (!raw) return;
    this.seeded.add(puuid);
    const stored = await this.load(puuid);
    for (const queue of ['solo', 'flex'] as RankedQueue[]) {
      const snap = queueSnapshot(raw, queue);
      if (snap) stored.baselines[queue] = snap;
    }
    await this.save(puuid, stored);
  }

  private async onGame(game: PostGame): Promise<void> {
    const queue = game.queueId ? QUEUE_BY_ID[game.queueId] : undefined;
    const puuid = this.connector.getState().summoner?.puuid;
    if (!queue || !puuid) return;
    const me = game.players.find((p) => p.isMe);

    const stored = await this.load(puuid);
    const before = stored.baselines[queue] ?? (await this.snapshotNow(queue));
    if (!before) return;

    // Espera o PDL da partida ser aplicado: o número de jogos da fila aumenta.
    let after: Snapshot | null = null;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const snap = await this.snapshotNow(queue);
      if (snap && snap.games > before.games) {
        after = snap;
        break;
      }
    }
    if (!after) {
      // Remake/dodge ou o jogo não contou: mantém a base, sem registrar.
      if (!stored.baselines[queue]) {
        stored.baselines[queue] = before;
        await this.save(puuid, stored);
      }
      return;
    }

    stored.entries.push({
      at: Date.now(),
      queue,
      tier: after.tier,
      division: after.division,
      lp: after.lp,
      lpChange: after.ladder - before.ladder,
      win: game.myTeamWon,
      championId: me?.championId ?? 0,
      note: rankMove(before, after),
    });
    if (stored.entries.length > MAX_ENTRIES) stored.entries = stored.entries.slice(-MAX_ENTRIES);
    stored.baselines[queue] = after;
    await this.save(puuid, stored);
    this.emit('updated', puuid);
  }

  private async snapshotNow(queue: RankedQueue): Promise<Snapshot | null> {
    const raw = await this.readRankedStats();
    return raw ? queueSnapshot(raw, queue) : null;
  }

  private async readRankedStats(): Promise<unknown> {
    const credentials = this.connector.getCredentials();
    if (!credentials) return null;
    return lcuRequest<unknown>(credentials, 'GET', '/lol-ranked/v1/current-ranked-stats').catch(() => null);
  }

  private async load(puuid: string): Promise<Stored> {
    const cached = this.data.get(puuid);
    if (cached) return cached;
    let stored: Stored = { baselines: {}, entries: [] };
    try {
      const raw = JSON.parse(await readFile(this.file(puuid), 'utf8')) as Stored;
      if (raw && Array.isArray(raw.entries)) stored = { baselines: raw.baselines ?? {}, entries: raw.entries };
    } catch {
      // Primeiro uso ou arquivo ilegível: começa vazio.
    }
    this.data.set(puuid, stored);
    return stored;
  }

  private async save(puuid: string, stored: Stored): Promise<void> {
    this.data.set(puuid, stored);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file(puuid), JSON.stringify(stored));
  }

  private file(puuid: string): string {
    return path.join(this.directory, `${puuid.replace(/[^A-Za-z0-9_-]/g, '')}.json`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
