import type { LcuCredentials } from '../lcu/credentials';
import { lcuRequest } from '../lcu/http';

/** Mesmo formato que o servidor devolve em /v1/matches. */
export interface MatchParticipant {
  puuid: string;
  riotId: string;
  championId: number;
  teamId: number;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  champLevel: number;
  cs: number;
  gold: number;
  damageToChampions: number;
  visionScore: number;
  items: number[];
  summonerSpellIds: number[];
  perks: { primaryStyleId: number; subStyleId: number; selections: number[]; statPerks: number[] };
}

export interface MatchSummary {
  matchId: string;
  queueId: number;
  mapId: number;
  gameVersion: string;
  gameEndTimestamp: number;
  gameDurationSeconds: number;
  participants: MatchParticipant[];
  /** "local": veio do histórico do cliente (a API da Riot não entrega esse modo). */
  source?: "local";
}

/** Partida no formato da API local do cliente (/lol-match-history). */
export interface LcuGame {
  gameId: number;
  platformId: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  mapId: number;
  gameVersion: string;
  participantIdentities?: Array<{
    participantId: number;
    player?: { puuid?: string; gameName?: string; tagLine?: string; summonerName?: string };
  }>;
  participants?: Array<{
    participantId: number;
    championId: number;
    teamId: number;
    spell1Id?: number;
    spell2Id?: number;
    stats?: Record<string, number | boolean>;
    timeline?: { lane?: string; role?: string };
  }>;
}

const LIST_SIZE = 40;
const LIST_TTL_MS = 60_000;

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Rota do cliente antigo (lane + role) para o formato do servidor. */
function position(timeline?: { lane?: string; role?: string }): string {
  const lane = (timeline?.lane ?? '').toUpperCase();
  const role = (timeline?.role ?? '').toUpperCase();
  if (lane === 'TOP') return 'top';
  if (lane === 'JUNGLE') return 'jungle';
  if (lane === 'MIDDLE' || lane === 'MID') return 'middle';
  if (lane === 'BOTTOM' || lane === 'BOT') return role === 'DUO_SUPPORT' || role === 'SUPPORT' ? 'utility' : 'bottom';
  return '';
}

/**
 * Converte uma partida do cliente para o formato do servidor. O PUUID do cliente
 * é diferente do PUUID da API da Riot; o do próprio jogador vira o da API para a
 * tela reconhecer quem é você.
 */
export function toSummary(game: LcuGame, localPuuid: string, apiPuuid: string): MatchSummary | null {
  const identities = new Map((game.participantIdentities ?? []).map((i) => [i.participantId, i.player ?? {}]));
  const participants = (game.participants ?? []).map((p): MatchParticipant => {
    const player = identities.get(p.participantId) ?? {};
    const stats = p.stats ?? {};
    const puuid = player.puuid === localPuuid ? apiPuuid : (player.puuid ?? '');
    return {
      puuid,
      riotId: player.gameName ? `${player.gameName}#${player.tagLine ?? ''}` : (player.summonerName ?? ''),
      championId: p.championId,
      teamId: p.teamId,
      position: position(p.timeline),
      win: stats.win === true,
      kills: num(stats.kills),
      deaths: num(stats.deaths),
      assists: num(stats.assists),
      champLevel: num(stats.champLevel),
      cs: num(stats.totalMinionsKilled) + num(stats.neutralMinionsKilled),
      gold: num(stats.goldEarned),
      damageToChampions: num(stats.totalDamageDealtToChampions),
      visionScore: num(stats.visionScore),
      items: [0, 1, 2, 3, 4, 5, 6].map((slot) => num(stats[`item${slot}`])),
      summonerSpellIds: [num(p.spell1Id), num(p.spell2Id)],
      perks: {
        primaryStyleId: num(stats.perkPrimaryStyle),
        subStyleId: num(stats.perkSubStyle),
        selections: [0, 1, 2, 3, 4, 5].map((i) => num(stats[`perk${i}`])).filter((id) => id > 0),
        statPerks: [0, 1, 2].map((i) => num(stats[`statPerk${i}`])),
      },
    };
  });
  if (!participants.some((p) => p.puuid === apiPuuid)) return null;
  return {
    matchId: `${game.platformId}_${game.gameId}`,
    queueId: game.queueId,
    mapId: game.mapId,
    gameVersion: game.gameVersion,
    gameEndTimestamp: game.gameCreation + game.gameDuration * 1000,
    gameDurationSeconds: game.gameDuration,
    participants,
    source: "local",
  };
}

/**
 * Junta as partidas do cliente que a API da Riot não entrega (ex.: ARAM: Desordem)
 * na página do servidor, pelo horário. `upper` é o fim da partida logo antes da
 * página (Infinity na primeira); `full` diz se a página veio cheia (há mais depois).
 */
export function mergePage(page: MatchSummary[], local: MatchSummary[], upper: number, full: boolean): MatchSummary[] {
  const known = new Set(page.map((m) => m.matchId));
  const lower = full && page.length ? page[page.length - 1].gameEndTimestamp : -Infinity;
  const extra = local.filter((m) => !known.has(m.matchId) && m.gameEndTimestamp < upper && m.gameEndTimestamp >= lower);
  return [...page, ...extra].sort((a, b) => b.gameEndTimestamp - a.gameEndTimestamp);
}

/** Histórico local do jogador logado, com os detalhes das 10 pessoas de cada partida. */
export class LocalHistory {
  private list: { at: number; games: LcuGame[] } | null = null;
  private readonly details = new Map<number, LcuGame>();

  async recent(credentials: LcuCredentials): Promise<LcuGame[]> {
    if (this.list && Date.now() - this.list.at < LIST_TTL_MS) return this.list.games;
    const response = await lcuRequest<{ games?: { games?: LcuGame[] } }>(
      credentials, 'GET', `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${LIST_SIZE}`,
    );
    const games = response?.games?.games ?? [];
    this.list = { at: Date.now(), games };
    return games;
  }

  /** A lista só traz o próprio jogador; a partida completa vem por id (e não muda mais). */
  async game(credentials: LcuCredentials, gameId: number): Promise<LcuGame | null> {
    const cached = this.details.get(gameId);
    if (cached) return cached;
    const game = await lcuRequest<LcuGame>(credentials, 'GET', `/lol-match-history/v1/games/${gameId}`).catch(() => null);
    if (game?.participants?.length) {
      this.details.set(gameId, game);
      if (this.details.size > 200) this.details.delete(this.details.keys().next().value!);
    }
    return game;
  }
}
