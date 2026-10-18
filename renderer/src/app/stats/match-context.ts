import type { ChampionInfo } from '../data-dragon/data-dragon.service';
import type { EnemyDamage, TierEntry } from './stats.types';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

export interface DamageProfile {
  damage: EnemyDamage;
  /** Fatia estimada de dano mágico do time inimigo (0 a 1). */
  magicShare: number;
}

/**
 * Perfil de dano do time inimigo pelas notas de ataque e magia do Data Dragon.
 * Usa os mesmos cortes do servidor (que mede o dano real das partidas coletadas):
 * 50% ou mais mágico é time de dano mágico, 30% ou menos é time de dano físico.
 */
export function damageProfile(enemies: Array<ChampionInfo | null>): DamageProfile | null {
  const known = enemies.filter((c): c is ChampionInfo => !!c && c.attack + c.magic > 0);
  if (known.length < 2) return null;
  const magicShare = known.reduce((sum, c) => sum + c.magic / (c.attack + c.magic), 0) / known.length;
  return { magicShare, damage: magicShare >= 0.5 ? 'ap' : magicShare <= 0.3 ? 'ad' : 'mixed' };
}

/**
 * Rota mais provável de cada campeão de um time, pela distribuição de rotas de cada um
 * na coleta Mestre+: testa todas as atribuições (no máximo 5! = 120) e fica com a de
 * maior probabilidade conjunta.
 */
export function assignPositions(championIds: number[], tierList: TierEntry[]): Map<number, string> {
  const champions = [...new Set(championIds.filter((id) => id > 0))].slice(0, POSITIONS.length);
  const games = new Map<string, number>();
  const totals = new Map<number, number>();
  for (const entry of tierList) {
    games.set(`${entry.championId}:${entry.position}`, entry.games);
    totals.set(entry.championId, (totals.get(entry.championId) ?? 0) + entry.games);
  }
  // Fatia de partidas do campeão na rota, com um piso para rotas raras.
  const chance = (championId: number, pos: string) => {
    const total = totals.get(championId) ?? 0;
    return total > 0 ? Math.max((games.get(`${championId}:${pos}`) ?? 0) / total, 0.001) : 0.2;
  };

  let best = { score: -Infinity, positions: [] as string[] };
  const current: string[] = [];
  const assign = (index: number, score: number) => {
    if (index === champions.length) {
      if (score > best.score) best = { score, positions: [...current] };
      return;
    }
    for (const pos of POSITIONS) {
      if (current.includes(pos)) continue;
      current.push(pos);
      assign(index + 1, score + Math.log(chance(champions[index], pos)));
      current.pop();
    }
  };
  assign(0, 0);
  return new Map(champions.map((id, i) => [id, best.positions[i]]));
}

/** Inimigo que mais provavelmente está na sua rota. */
export function guessLaneOpponent(position: string | null, enemyIds: number[], tierList: TierEntry[]): number | null {
  const lane = position?.toUpperCase();
  if (!lane || !POSITIONS.includes(lane)) return null;
  for (const [championId, pos] of assignPositions(enemyIds, tierList)) if (pos === lane) return championId;
  return null;
}

/** Sua rota provável pelos campeões do seu time (quando o jogo não informa). */
export function guessOwnPosition(championId: number, allyIds: number[], tierList: TierEntry[]): string | null {
  return assignPositions([championId, ...allyIds.filter((id) => id !== championId)], tierList).get(championId) ?? null;
}

let tierListCache: Promise<TierEntry[]> | null = null;

/** Tier list de todas as rotas, buscada uma vez por sessão do app. */
export function allPositionsTierList(): Promise<TierEntry[]> {
  if (!window.stats) return Promise.resolve([]);
  tierListCache ??= window.stats.tierList(null).catch(() => {
    tierListCache = null;
    return [];
  });
  return tierListCache;
}
