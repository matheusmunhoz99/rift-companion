import type { LiveParticipant } from '../history/riot.types';
import { mainRank } from '../riot/labels';

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX_START = TIERS.indexOf('MASTER') * 400;

/** Escala da curva: 1 tier de diferença média ≈ 68% de chance. */
const SCALE = 1200;

export interface WinChance {
  /** Chance estimada do time aliado, em %. */
  allyPercent: number;
  rankedPlayers: number;
  totalPlayers: number;
}

/** Elo em pontos: 400 por tier, 100 por divisão e os PDL (Mestre+ soma os PDL direto). */
export function rating(participant: LiveParticipant): number | null {
  const entry = mainRank(participant.ranked);
  if (!entry) return null;
  const tier = TIERS.indexOf(entry.tier);
  if (tier < 0) return null;
  if (tier * 400 >= APEX_START) return APEX_START + entry.leaguePoints;
  const division = Math.max(DIVISIONS.indexOf(entry.rank), 0);
  return tier * 400 + division * 100 + Math.min(entry.leaguePoints, 100);
}

/**
 * Estimativa simples pela diferença do elo médio dos times (curva logística).
 * Jogadores sem elo recebem a média dos jogadores com elo da partida.
 * Não é um modelo treinado: serve como referência, não como previsão.
 */
export function estimateWinChance(participants: LiveParticipant[], allyTeamId: number): WinChance | null {
  const ratings = participants.map((p) => ({ teamId: p.teamId, value: rating(p) }));
  const known = ratings.filter((r) => r.value !== null).map((r) => r.value as number);
  if (known.length === 0) return null;

  const fallback = known.reduce((sum, value) => sum + value, 0) / known.length;
  const average = (teamId: number) => {
    const team = ratings.filter((r) => r.teamId === teamId).map((r) => r.value ?? fallback);
    return team.reduce((sum, value) => sum + value, 0) / Math.max(team.length, 1);
  };

  const enemyTeamId = participants.find((p) => p.teamId !== allyTeamId)?.teamId ?? allyTeamId;
  const diff = average(allyTeamId) - average(enemyTeamId);
  const probability = 1 / (1 + Math.pow(10, -diff / SCALE));

  return {
    allyPercent: Math.round(Math.min(Math.max(probability, 0.1), 0.9) * 100),
    rankedPlayers: known.length,
    totalPlayers: participants.length,
  };
}
