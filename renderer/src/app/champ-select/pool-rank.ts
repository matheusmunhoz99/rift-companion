import type { MatchParticipant, MatchSummary } from '../history/riot.types';
import type { CounterData, TierEntry } from '../stats/stats.types';

const RIFT_MAP = 11;
/** Mínimo de partidas suas com o campeão para ele entrar no seu pool. */
const MIN_GAMES = 2;
const MAX_SUGGESTIONS = 4;
/** Peso do seu histórico na nota; o resto é o confronto (ou a força do campeão na rota). */
const PERSONAL_WEIGHT = 0.6;

export interface PoolSuggestion {
  championId: number;
  games: number;
  wins: number;
  /** Seu aproveitamento suavizado (começa em 50% e anda com as partidas). */
  personal: number;
  /** Vitórias do campeão contra o inimigo da sua rota (Mestre+); null sem o confronto. */
  matchup: number | null;
  score: number;
}

/**
 * Seus campeões para esta seleção: o que você ganha com cada um (nesta rota) somado a como
 * ele vai contra o inimigo da sua rota, ou, sem o confronto ainda, à força dele na rota.
 * Função pura (testável): quem chama passa o histórico e as estatísticas.
 */
export function rankPool(
  rows: Array<{ match: MatchSummary; me: MatchParticipant }>,
  position: string,
  pickable: ReadonlySet<number>,
  tierList: TierEntry[],
  counters: CounterData | null,
): PoolSuggestion[] {
  const lane = position.toUpperCase();
  const pool = new Map<number, { games: number; wins: number }>();
  for (const { match, me } of rows) {
    if (match.mapId !== RIFT_MAP || match.gameDurationSeconds < 600) continue;
    // O histórico guarda a rota em minúsculas ("top"); as estatísticas, em maiúsculas.
    if (lane && me.position && me.position.toUpperCase() !== lane) continue;
    const line = pool.get(me.championId) ?? { games: 0, wins: 0 };
    line.games++;
    if (me.win) line.wins++;
    pool.set(me.championId, line);
  }
  const matchupOf = (id: number) =>
    counters ? ([...counters.good, ...counters.bad].find((e) => e.championId === id)?.winRate ?? null) : null;
  const metaOf = (id: number) =>
    tierList.find((t) => t.championId === id && (!lane || t.position === lane))?.winRate ?? 0.5;

  return [...pool]
    .filter(([id, line]) => line.games >= MIN_GAMES && pickable.has(id))
    .map(([championId, line]) => {
      const personal = (line.wins + 2) / (line.games + 4);
      const matchup = matchupOf(championId);
      const score = personal * PERSONAL_WEIGHT + (matchup ?? metaOf(championId)) * (1 - PERSONAL_WEIGHT);
      return { championId, games: line.games, wins: line.wins, personal, matchup, score };
    })
    .sort((a, b) => b.score - a.score || b.games - a.games)
    .slice(0, MAX_SUGGESTIONS);
}
