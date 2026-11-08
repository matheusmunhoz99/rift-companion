import type { RankedEntry } from '../history/riot.types';
import { mainRank, tierName } from '../riot/labels';

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];

/**
 * Até que nível da conta cada elo é suspeito. A ranqueada abre no nível 30; quem chega a
 * Ouro com a conta ainda no 40, Platina/Esmeralda antes do 60 ou Diamante+ antes do 100
 * quase sempre já jogou muito em outra conta.
 */
const MAX_LEVEL_BY_TIER: Array<[tier: string, maxLevel: number]> = [
  ['DIAMOND', 100],
  ['PLATINUM', 60],
  ['GOLD', 40],
];

/** "Provável smurf": conta de nível baixo com elo alto. null quando não há sinal. */
export function smurfHint(summonerLevel: number | null | undefined, ranked: RankedEntry[]): string | null {
  if (!summonerLevel || summonerLevel < 30) return null;
  const rank = mainRank(ranked);
  if (!rank) return null;
  const tier = TIERS.indexOf(rank.tier);
  if (tier < 0) return null;
  for (const [minTier, maxLevel] of MAX_LEVEL_BY_TIER) {
    if (tier >= TIERS.indexOf(minTier) && summonerLevel <= maxLevel) return `Nível ${summonerLevel} e já ${tierName(rank.tier)}`;
  }
  return null;
}
