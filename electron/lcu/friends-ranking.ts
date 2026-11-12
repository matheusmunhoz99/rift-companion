import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUDDY_ID } from '../invisible/buddy';
import type { LcuConnector } from './connector';
import type { LcuCredentials } from './credentials';
import { LcuHttpError, lcuRequest } from './http';
import { ladderValue, type RankedQueue } from './rank-tracker';

/** Elo de uma fila de um amigo, como o cliente informa (derrotas de outros jogadores vêm zeradas). */
export interface FriendQueueRank {
  tier: string;
  division: string;
  lp: number;
  /** Elo em pontos absolutos, para ordenar o ranking. */
  ladder: number;
  wins: number;
  peakTier: string;
  peakDivision: string;
  previousTier: string;
  previousDivision: string;
}

/** Resultado das partidas recentes de uma fila (do histórico do cliente). */
export interface FriendRecent {
  weekWins: number;
  weekLosses: number;
  /** Positivo = vitórias seguidas, negativo = derrotas seguidas (partidas mais novas). */
  streak: number;
  lastPlayed: number | null;
}

export interface FriendRankRow {
  puuid: string;
  gameName: string;
  tagLine: string;
  icon: number;
  availability: string;
  gameStatus: string;
  isMe: boolean;
  ranks: Record<RankedQueue, FriendQueueRank | null>;
  /** Partidas recentes (null enquanto o histórico deste amigo ainda não foi lido). */
  recent: Record<RankedQueue, FriendRecent> | null;
  /** PDL ganho na semana (null se ainda não há base para comparar). */
  weekLp: Record<RankedQueue, number | null>;
}

export interface FriendsRanking {
  rows: FriendRankRow[];
  /** Início da semana (segunda 00:00, horário local). */
  weekStart: number;
  /** Quando a base de PDL da semana foi tirada (depois do início, se o app abriu no meio da semana). */
  baseTakenAt: number;
  fetchedAt: number;
  /** Ainda lendo o histórico de partidas dos amigos (em segundo plano, um por vez). */
  historyPending: boolean;
}

interface WeekBase {
  weekStart: number;
  takenAt: number;
  ladders: Record<string, Partial<Record<RankedQueue, number>>>;
}

interface RawFriend {
  puuid: string;
  gameName: string;
  gameTag: string;
  icon: number;
  availability: string;
  product: string;
  lol?: { gameStatus?: string };
}

interface RawQueue {
  tier?: string;
  division?: string;
  leaguePoints?: number;
  wins?: number;
  highestTier?: string;
  highestDivision?: string;
  previousSeasonEndTier?: string;
  previousSeasonEndDivision?: string;
}

/** Histórico já lido de cada amigo (só o necessário), salvo em disco. */
interface StoredHistory {
  at: number;
  games: RawGame[];
}

interface RawGame {
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  participants?: Array<{ stats?: { win?: boolean } }>;
}

const QUEUE_KEY: Record<RankedQueue, string> = { solo: 'RANKED_SOLO_5x5', flex: 'RANKED_FLEX_SR' };
const QUEUE_ID: Record<RankedQueue, number> = { solo: 420, flex: 440 };
const QUEUES: RankedQueue[] = ['solo', 'flex'];
/** Partidas do histórico lidas por amigo. O cliente leva ~0,35 s por partida pedida. */
const HISTORY_GAMES = 20;
/** O cliente busca o histórico nos servidores da Riot: pode passar de 7 s. */
const HISTORY_TIMEOUT_MS = 25_000;
/** Remake: partidas mais curtas que isso não contam. */
const REMAKE_SECONDS = 300;
const CACHE_MS = 3 * 60_000;
/** Elo: pedidos leves, alguns em paralelo. */
const PARALLEL = 4;
/** Histórico de cada amigo vale por 20 min; depois disso é lido de novo (um por vez). */
const HISTORY_FRESH_MS = 20 * 60_000;
/** Histórico mais velho que isso não é mostrado. */
const HISTORY_MAX_AGE_MS = 24 * 60 * 60_000;
/** Pausa entre um histórico e outro, para não sobrecarregar o cliente. */
const HISTORY_GAP_MS = 400;
/** Se o cliente parar de responder o histórico, espera antes de tentar de novo. */
const HISTORY_BACKOFF_MS = 10 * 60_000;

/** Segunda-feira 00:00 (horário local) da semana de `now`. */
export function weekStartOf(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const sinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - sinceMonday);
  return date.getTime();
}

/** Converte o queueMap do cliente no elo de uma fila (null se sem elo na fila). */
export function queueRank(raw: unknown, queue: RankedQueue): FriendQueueRank | null {
  const q = (raw as { queueMap?: Record<string, RawQueue> } | null)?.queueMap?.[QUEUE_KEY[queue]];
  if (!q?.tier) return null;
  const ladder = ladderValue(q.tier, q.division ?? '', q.leaguePoints ?? 0);
  if (ladder === null) return null;
  const division = (value?: string) => (value && value !== 'NA' ? value.toUpperCase() : '');
  return {
    tier: q.tier.toUpperCase(),
    division: division(q.division),
    lp: Math.max(0, q.leaguePoints ?? 0),
    ladder,
    wins: q.wins ?? 0,
    peakTier: (q.highestTier ?? '').toUpperCase(),
    peakDivision: division(q.highestDivision),
    previousTier: (q.previousSeasonEndTier ?? '').toUpperCase(),
    previousDivision: division(q.previousSeasonEndDivision),
  };
}

/** Vitórias/derrotas da semana e a sequência atual de uma fila, a partir do histórico (mais novas primeiro). */
export function recentOf(games: RawGame[], queue: RankedQueue, weekStart: number): FriendRecent {
  const played = games
    .filter((g) => g.queueId === QUEUE_ID[queue] && g.gameDuration >= REMAKE_SECONDS)
    .map((g) => ({ at: g.gameCreation, win: g.participants?.[0]?.stats?.win === true }))
    .sort((a, b) => b.at - a.at);
  const week = played.filter((g) => g.at >= weekStart);
  let streak = 0;
  for (const game of played) {
    if (streak === 0) streak = game.win ? 1 : -1;
    else if (game.win === streak > 0) streak += streak > 0 ? 1 : -1;
    else break;
  }
  return {
    weekWins: week.filter((g) => g.win).length,
    weekLosses: week.filter((g) => !g.win).length,
    streak,
    lastPlayed: played[0]?.at ?? null,
  };
}

/**
 * Ranking dos amigos: elo, pico e temporada passada de cada amigo (Solo/Duo e Flex), as
 * partidas da semana e o PDL ganho desde segunda. Tudo vem do próprio cliente do LoL —
 * não usa a API da Riot. A base de PDL da semana fica salva neste PC.
 */
export class FriendsRankingService extends EventEmitter<{ updated: [] }> {
  private cache: FriendsRanking | null = null;
  private pending: Promise<FriendsRanking> | null = null;
  private histories = new Map<string, StoredHistory>();
  private historiesOwner: string | null = null;
  private historyRunning = false;
  private historyBlockedUntil = 0;

  constructor(
    private readonly connector: LcuConnector,
    private readonly directory: string,
  ) {
    super();
  }

  get(force = false): Promise<FriendsRanking> {
    if (!force && this.cache && Date.now() - this.cache.fetchedAt < CACHE_MS) {
      void this.readHistories();
      return Promise.resolve(this.cache);
    }
    this.pending ??= this.build().finally(() => (this.pending = null));
    return this.pending;
  }

  private async build(): Promise<FriendsRanking> {
    const credentials = this.connector.getCredentials();
    const me = this.connector.getState().summoner;
    if (!credentials || !me) throw new Error('Abra o LoL para ver o ranking dos amigos.');

    const friends = await lcuRequest<RawFriend[]>(credentials, 'GET', '/lol-chat/v1/friends');
    const people = [
      { puuid: me.puuid, gameName: me.gameName, gameTag: me.tagLine, icon: me.profileIconId, availability: 'chat', product: 'league_of_legends' },
      ...friends.filter((f) => f.puuid && f.puuid !== BUDDY_ID && f.puuid !== me.puuid),
    ];

    const now = Date.now();
    const weekStart = weekStartOf(now);
    const rows = await mapLimit(people, PARALLEL, (person) => this.row(credentials, person, person.puuid === me.puuid));
    const ranked = rows.filter((row): row is FriendRankRow => !!row);
    await this.loadHistories(me.puuid);

    const base = await this.weekBase(me.puuid, weekStart, now, ranked);
    for (const row of ranked) {
      for (const queue of QUEUES) {
        const start = base.ladders[row.puuid]?.[queue];
        const current = row.ranks[queue]?.ladder;
        row.weekLp[queue] = start !== undefined && current !== undefined ? current - start : null;
      }
    }

    this.cache = { rows: ranked, weekStart, baseTakenAt: base.takenAt, fetchedAt: now, historyPending: false };
    this.applyHistories();
    void this.readHistories();
    return this.cache;
  }

  /** Preenche as partidas recentes de cada linha com o histórico já lido. */
  private applyHistories(): void {
    const cache = this.cache;
    if (!cache) return;
    const now = Date.now();
    for (const row of cache.rows) {
      const history = this.histories.get(row.puuid);
      row.recent =
        history && now - history.at < HISTORY_MAX_AGE_MS
          ? { solo: recentOf(history.games, 'solo', cache.weekStart), flex: recentOf(history.games, 'flex', cache.weekStart) }
          : null;
    }
    cache.historyPending = this.historyRunning;
  }

  /**
   * Lê o histórico dos amigos um por vez, em segundo plano. O cliente do LoL busca isso nos
   * servidores da Riot e trava com muitos pedidos juntos, então: um de cada vez, com pausa,
   * e para tudo na primeira demora (tenta de novo mais tarde).
   */
  private async readHistories(): Promise<void> {
    if (this.historyRunning || Date.now() < this.historyBlockedUntil) return;
    const cache = this.cache;
    const credentials = this.connector.getCredentials();
    if (!cache || !credentials) return;
    const order = (row: FriendRankRow) =>
      row.isMe ? 0 : row.gameStatus === 'inGame' || row.gameStatus === 'championSelect' ? 1 : row.availability !== 'offline' && row.availability !== 'mobile' ? 2 : 3;
    const queue = cache.rows
      .filter((row) => row.ranks.solo || row.ranks.flex)
      .filter((row) => {
        const history = this.histories.get(row.puuid);
        return !history || Date.now() - history.at > HISTORY_FRESH_MS;
      })
      .sort((a, b) => order(a) - order(b));
    if (!queue.length) return;

    this.historyRunning = true;
    cache.historyPending = true;
    let sinceEmit = 0;
    try {
      for (const row of queue) {
        const id = encodeURIComponent(row.puuid);
        try {
          const history = await lcuRequest<{ games?: { games?: RawGame[] } }>(
            credentials,
            'GET',
            `/lol-match-history/v1/products/lol/${id}/matches?begIndex=0&endIndex=${HISTORY_GAMES - 1}`,
            undefined,
            HISTORY_TIMEOUT_MS,
          );
          const games = (history?.games?.games ?? []).map((g) => ({
            queueId: g.queueId,
            gameCreation: g.gameCreation,
            gameDuration: g.gameDuration,
            participants: [{ stats: { win: g.participants?.[0]?.stats?.win === true } }],
          }));
          this.histories.set(row.puuid, { at: Date.now(), games });
        } catch (error) {
          // Erro só deste amigo (conta de outra região, sem histórico): pula para o próximo.
          if (error instanceof LcuHttpError) {
            this.histories.set(row.puuid, { at: Date.now(), games: [] });
            continue;
          }
          // Cliente sem responder: para tudo e tenta mais tarde.
          this.historyBlockedUntil = Date.now() + HISTORY_BACKOFF_MS;
          break;
        }
        if (++sinceEmit >= 5) {
          sinceEmit = 0;
          this.applyHistories();
          this.emit('updated');
        }
        await new Promise((resolve) => setTimeout(resolve, HISTORY_GAP_MS));
      }
    } finally {
      this.historyRunning = false;
      this.applyHistories();
      this.emit('updated');
      await this.saveHistories();
    }
  }

  private historiesFile(owner: string): string {
    return path.join(this.directory, `${owner.replace(/[^A-Za-z0-9_-]/g, '')}-history.json`);
  }

  private async loadHistories(owner: string): Promise<void> {
    if (this.historiesOwner === owner) return;
    this.historiesOwner = owner;
    this.histories = new Map();
    try {
      const raw = JSON.parse(await readFile(this.historiesFile(owner), 'utf8')) as Record<string, StoredHistory>;
      const now = Date.now();
      for (const [puuid, entry] of Object.entries(raw)) {
        if (entry && Array.isArray(entry.games) && now - entry.at < HISTORY_MAX_AGE_MS) this.histories.set(puuid, entry);
      }
    } catch {
      // Primeiro uso.
    }
  }

  private async saveHistories(): Promise<void> {
    if (!this.historiesOwner) return;
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(this.historiesFile(this.historiesOwner), JSON.stringify(Object.fromEntries(this.histories)));
    } catch {
      // Sem disco: fica só na memória.
    }
  }

  private async row(credentials: LcuCredentials, person: RawFriend, isMe: boolean): Promise<FriendRankRow | null> {
    const id = encodeURIComponent(person.puuid);
    const stats = await lcuRequest<unknown>(credentials, 'GET', `/lol-ranked/v1/ranked-stats/${id}`).catch(() => null);
    if (!stats) return null;
    return {
      puuid: person.puuid,
      gameName: person.gameName,
      tagLine: person.gameTag,
      icon: person.icon,
      availability: person.availability,
      gameStatus: person.product === 'league_of_legends' ? (person.lol?.gameStatus ?? '') : '',
      isMe,
      ranks: { solo: queueRank(stats, 'solo'), flex: queueRank(stats, 'flex') },
      recent: null,
      weekLp: { solo: null, flex: null },
    };
  }

  /** Base de PDL da semana: tirada na primeira leitura da semana; amigos novos entram quando aparecem. */
  private async weekBase(owner: string, weekStart: number, now: number, rows: FriendRankRow[]): Promise<WeekBase> {
    const file = path.join(this.directory, `${owner.replace(/[^A-Za-z0-9_-]/g, '')}.json`);
    let base: WeekBase | null = null;
    try {
      base = JSON.parse(await readFile(file, 'utf8')) as WeekBase;
    } catch {
      // Primeiro uso: cria a base agora.
    }
    if (!base || base.weekStart !== weekStart || !base.ladders) base = { weekStart, takenAt: now, ladders: {} };

    let changed = false;
    for (const row of rows) {
      const entry = (base.ladders[row.puuid] ??= {});
      for (const queue of QUEUES) {
        const ladder = row.ranks[queue]?.ladder;
        if (ladder !== undefined && entry[queue] === undefined) {
          entry[queue] = ladder;
          changed = true;
        }
      }
    }
    if (changed || base.takenAt === now) {
      await mkdir(this.directory, { recursive: true });
      await writeFile(file, JSON.stringify(base));
    }
    return base;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
