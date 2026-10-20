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
  const chance = laneChance(tierList);
  const positions = bestAssignment(champions.map((id) => (pos: string) => chance(id, pos)));
  return new Map(champions.map((id, i) => [id, positions[i]]));
}

/** Smite: o feitiço de quem joga na selva. */
const SMITE_SPELL_ID = 11;
/** Chance de uma rota que contradiz o que o jogo informou (ou o Golpear). */
const UNLIKELY = 1e-6;

export interface PositionHint {
  championId: number;
  summonerSpellIds: number[];
  /** Rota informada pelo jogo ou pela seleção, quando existe. */
  known: string | null;
}

/**
 * Rota de cada jogador de um time de 5 em Summoner's Rift, na ordem recebida.
 * Prioridade: rota informada pelo jogo, depois Golpear (selva), depois a
 * distribuição de rotas do campeão na coleta. `null` se o time não tem 5.
 */
export function assignTeamPositions(players: PositionHint[], tierList: TierEntry[]): string[] | null {
  if (players.length !== POSITIONS.length) return null;
  const chance = laneChance(tierList);
  return bestAssignment(players.map((player) => {
    const known = player.known && POSITIONS.includes(player.known) ? player.known : null;
    if (known) return (pos: string) => (pos === known ? 1 : UNLIKELY);
    if (player.summonerSpellIds.includes(SMITE_SPELL_ID)) return (pos: string) => (pos === 'JUNGLE' ? 1 : UNLIKELY);
    return (pos: string) => chance(player.championId, pos);
  }));
}

/** Índice para ordenar: Topo, Selva, Meio, Atirador, Suporte. */
export function positionOrder(position: string | null | undefined): number {
  const index = position ? POSITIONS.indexOf(position) : -1;
  return index < 0 ? POSITIONS.length : index;
}

/** Fatia de partidas do campeão na rota, com um piso para rotas raras. */
function laneChance(tierList: TierEntry[]): (championId: number, pos: string) => number {
  const games = new Map<string, number>();
  const totals = new Map<number, number>();
  for (const entry of tierList) {
    games.set(`${entry.championId}:${entry.position}`, entry.games);
    totals.set(entry.championId, (totals.get(entry.championId) ?? 0) + entry.games);
  }
  return (championId, pos) => {
    const total = totals.get(championId) ?? 0;
    return total > 0 ? Math.max((games.get(`${championId}:${pos}`) ?? 0) / total, 0.001) : 0.2;
  };
}

/** Testa todas as atribuições (no máximo 5! = 120) e fica com a de maior probabilidade conjunta. */
function bestAssignment(chances: Array<(pos: string) => number>): string[] {
  let best = { score: -Infinity, positions: [] as string[] };
  const current: string[] = [];
  const assign = (index: number, score: number) => {
    if (index === chances.length) {
      if (score > best.score) best = { score, positions: [...current] };
      return;
    }
    for (const pos of POSITIONS) {
      if (current.includes(pos)) continue;
      current.push(pos);
      assign(index + 1, score + Math.log(chances[index](pos)));
      current.pop();
    }
  };
  assign(0, 0);
  return best.positions;
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

/** A coleta não para: a tier list é renovada para acompanhar o patch atual. */
const TIER_LIST_TTL_MS = 30 * 60_000;
let tierListCache: { at: number; value: Promise<TierEntry[]> } | null = null;

/** Tier list de todas as rotas, guardada por 30 min. */
export function allPositionsTierList(): Promise<TierEntry[]> {
  if (!window.stats) return Promise.resolve([]);
  if (!tierListCache || Date.now() - tierListCache.at > TIER_LIST_TTL_MS) {
    const value = window.stats.tierList(null).catch(() => {
      tierListCache = null;
      return [];
    });
    tierListCache = { at: Date.now(), value };
  }
  return tierListCache.value;
}
