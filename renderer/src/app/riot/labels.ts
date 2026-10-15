import type { RankedEntry } from '../history/riot.types';

export const QUEUE_NAMES: Record<number, string> = {
  0: 'Personalizada',
  400: 'Normal (Escolha)',
  420: 'Ranqueada Solo/Duo',
  430: 'Normal (Às Cegas)',
  440: 'Ranqueada Flex',
  450: 'ARAM',
  480: 'Partida Rápida',
  490: 'Partida Rápida',
  700: 'Clash',
  900: 'ARURF',
  1700: 'Arena',
  1900: 'URF',
  2400: 'ARAM: Desordem',
};

export const TIER_NAMES: Record<string, string> = {
  IRON: 'Ferro',
  BRONZE: 'Bronze',
  SILVER: 'Prata',
  GOLD: 'Ouro',
  PLATINUM: 'Platina',
  EMERALD: 'Esmeralda',
  DIAMOND: 'Diamante',
  MASTER: 'Mestre',
  GRANDMASTER: 'Grão-Mestre',
  CHALLENGER: 'Desafiante',
};

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function queueName(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `Fila ${queueId}`;
}

export function tierName(tier: string): string {
  return TIER_NAMES[tier] ?? tier;
}

export function rankQueueLabel(queueType: string): string {
  if (queueType === 'RANKED_SOLO_5x5') return 'Solo/Duo';
  if (queueType === 'RANKED_FLEX_SR') return 'Flex';
  return queueType;
}

/** Elo principal: Solo/Duo, ou Flex se não houver. */
export function mainRank(ranked: RankedEntry[]): RankedEntry | null {
  return (
    ranked.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ??
    ranked.find((entry) => entry.queueType === 'RANKED_FLEX_SR') ??
    null
  );
}

export function rankText(entry: RankedEntry): string {
  const division = APEX_TIERS.has(entry.tier) ? '' : ` ${entry.rank}`;
  return `${tierName(entry.tier)}${division} · ${entry.leaguePoints} PDL`;
}

export function winRate(wins: number, losses: number): number | null {
  const games = wins + losses;
  return games > 0 ? Math.round((wins / games) * 100) : null;
}
