import type { ChampionInfo } from '../data-dragon/data-dragon.service';
import type { EnemyDamage, TierEntry } from './stats.types';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** Fatias de dano de um campeão (somam 1) e de onde vieram. */
export interface DamageSplit {
  ap: number;
  ad: number;
  true: number;
  /** true = dano real medido nas partidas Mestre+; false = estimativa pelas notas do Data Dragon. */
  measured: boolean;
}

/**
 * Base medida em 247k+ partidas Mestre+ (BR, EUW e KR): [ap, ad, true].
 * Garante divisão real desde o primeiro instante (mesmo offline ou antes da rede responder),
 * corrigindo campeões onde as notas do Data Dragon medem "uso de habilidades" e não tipo de dano
 * (ex.: Qiyana tem magic=4, attack=0 no Data Dragon mas causa 80% de dano físico e 13% verdadeiro).
 */
export const BASELINE_DAMAGE: Record<number, readonly [number, number, number]> = {
  1: [0.9, 0.05, 0.05], 2: [0, 0.7, 0.3], 3: [0.95, 0.02, 0.03], 4: [0.83, 0.15, 0.03],
  5: [0.07, 0.87, 0.05], 6: [0.01, 0.88, 0.11], 7: [0.85, 0.06, 0.09], 8: [0.94, 0.04, 0.02],
  9: [0.92, 0.02, 0.06], 10: [0.73, 0.25, 0.02], 11: [0.03, 0.66, 0.31], 12: [0.8, 0.15, 0.05],
  13: [0.95, 0.04, 0.01], 14: [0.36, 0.62, 0.03], 15: [0.01, 0.98, 0.02], 16: [0.8, 0.14, 0.06],
  17: [0.78, 0.16, 0.06], 18: [0.08, 0.9, 0.02], 19: [0.49, 0.49, 0.03], 20: [0.9, 0.05, 0.05],
  21: [0.06, 0.91, 0.03], 22: [0.09, 0.89, 0.02], 23: [0.01, 0.89, 0.1], 24: [0.44, 0.52, 0.04],
  25: [0.88, 0.07, 0.05], 26: [0.82, 0.16, 0.03], 27: [0.91, 0.05, 0.04], 28: [0.9, 0.03, 0.07],
  29: [0.05, 0.79, 0.16], 30: [0.93, 0.01, 0.06], 31: [0.54, 0.18, 0.28], 32: [0.75, 0.1, 0.15],
  33: [0.64, 0.32, 0.04], 34: [0.87, 0.08, 0.05], 35: [0.57, 0.28, 0.15], 36: [0.54, 0.45, 0.02],
  37: [0.76, 0.22, 0.02], 38: [0.85, 0.09, 0.07], 39: [0.23, 0.72, 0.04],
  40: [0.78, 0.16, 0.06], 41: [0.18, 0.66, 0.16], 42: [0.19, 0.66, 0.15], 43: [0.88, 0.1, 0.02],
  44: [0.62, 0.33, 0.05], 45: [0.94, 0.04, 0.02], 48: [0.13, 0.82, 0.05], 50: [0.9, 0.08, 0.03],
  51: [0.03, 0.95, 0.02], 53: [0.61, 0.32, 0.08], 54: [0.7, 0.28, 0.02], 55: [0.7, 0.23, 0.07],
  56: [0.06, 0.84, 0.1], 57: [0.82, 0.12, 0.07], 58: [0.17, 0.78, 0.05], 59: [0.07, 0.85, 0.08],
  60: [0.83, 0.08, 0.09], 61: [0.93, 0.06, 0.01], 62: [0.13, 0.8, 0.07], 63: [0.93, 0.04, 0.03],
  64: [0.13, 0.79, 0.07], 67: [0.04, 0.76, 0.21], 68: [0.92, 0.04, 0.05], 69: [0.96, 0.02, 0.02],
  72: [0.28, 0.65, 0.07], 74: [0.93, 0.05, 0.02], 75: [0.25, 0.74, 0.01], 76: [0.81, 0.08, 0.12],
  77: [0.52, 0.44, 0.04], 78: [0.16, 0.79, 0.05], 79: [0.89, 0.08, 0.04], 80: [0.04, 0.89, 0.07],
  81: [0.29, 0.7, 0.02], 82: [0.83, 0.13, 0.05], 83: [0.3, 0.67, 0.02], 84: [0.86, 0.06, 0.08],
  85: [0.81, 0.15, 0.04], 86: [0, 0.77, 0.23], 89: [0.65, 0.29, 0.06], 90: [0.96, 0.03, 0.02],
  91: [0, 0.9, 0.1], 92: [0, 0.93, 0.07], 96: [0.68, 0.23, 0.09], 98: [0.41, 0.53, 0.06],
  99: [0.9, 0.06, 0.04], 101: [0.96, 0.03, 0.02], 102: [0.38, 0.45, 0.18], 103: [0.71, 0.08, 0.21],
  104: [0.04, 0.86, 0.11], 105: [0.78, 0.13, 0.1], 106: [0.44, 0.51, 0.04], 107: [0.05, 0.85, 0.1],
  110: [0.37, 0.61, 0.02], 111: [0.64, 0.3, 0.06], 112: [0.96, 0.03, 0.01], 113: [0.36, 0.58, 0.06],
  114: [0.05, 0.59, 0.37], 115: [0.95, 0.04, 0.02], 117: [0.82, 0.16, 0.02], 119: [0, 0.98, 0.02],
  120: [0.15, 0.82, 0.03], 121: [0.06, 0.82, 0.13], 122: [0, 0.77, 0.22], 126: [0.17, 0.78, 0.05],
  127: [0.9, 0.06, 0.04], 131: [0.83, 0.11, 0.06], 133: [0.01, 0.9, 0.1], 134: [0.9, 0.04, 0.06],
  136: [0.97, 0.01, 0.03], 141: [0.06, 0.85, 0.09], 142: [0.75, 0.09, 0.16], 143: [0.87, 0.05, 0.08],
  145: [0.4, 0.59, 0.02], 147: [0.86, 0.12, 0.01], 150: [0.17, 0.82, 0.02], 154: [0.87, 0.08, 0.06],
  157: [0.09, 0.89, 0.02], 161: [0.7, 0.02, 0.27], 163: [0.91, 0.04, 0.05], 164: [0.05, 0.62, 0.32],
  166: [0.09, 0.86, 0.05], 200: [0.1, 0.69, 0.21], 201: [0.78, 0.19, 0.03], 202: [0.06, 0.92, 0.02],
  203: [0.14, 0.77, 0.09], 221: [0.22, 0.76, 0.02], 222: [0.03, 0.95, 0.02], 223: [0.77, 0.2, 0.04],
  233: [0.09, 0.82, 0.09], 234: [0.08, 0.84, 0.08], 235: [0.09, 0.9, 0.02], 236: [0.1, 0.88, 0.02],
  238: [0.03, 0.87, 0.1], 240: [0.06, 0.89, 0.05], 245: [0.78, 0.11, 0.11], 246: [0.07, 0.8, 0.13],
  254: [0, 0.93, 0.06], 266: [0.08, 0.88, 0.05], 267: [0.85, 0.13, 0.02], 268: [0.95, 0.03, 0.02],
  350: [0.92, 0.05, 0.03], 360: [0.1, 0.87, 0.03], 412: [0.79, 0.15, 0.06], 420: [0.03, 0.96, 0.02],
  421: [0.15, 0.59, 0.26], 427: [0.64, 0.28, 0.09], 429: [0.17, 0.75, 0.08], 432: [0.6, 0.32, 0.09],
  497: [0.73, 0.23, 0.05], 498: [0.01, 0.98, 0.02], 516: [0.63, 0.35, 0.03], 517: [0.91, 0.03, 0.07],
  518: [0.88, 0.09, 0.04], 523: [0.05, 0.94, 0.02], 526: [0.73, 0.23, 0.05], 555: [0, 0.74, 0.26],
  711: [0.89, 0.07, 0.04], 777: [0.16, 0.72, 0.13], 799: [0.02, 0.93, 0.06], 800: [0.92, 0.07, 0.01],
  804: [0.33, 0.65, 0.02], 805: [0.85, 0.05, 0.1], 875: [0, 0.74, 0.25], 876: [0.75, 0.04, 0.21],
  887: [0.69, 0.13, 0.18], 888: [0.62, 0.2, 0.18], 893: [0.87, 0.07, 0.06], 895: [0, 0.97, 0.03],
  897: [0.08, 0.86, 0.06], 901: [0.2, 0.7, 0.1], 902: [0.77, 0.2, 0.03], 904: [0.05, 0.89, 0.06],
  910: [0.95, 0.04, 0.01], 950: [0.02, 0.89, 0.09],
};

/**
 * Estimativa pelas notas de ataque e magia (0 a 10). As notas puxam para o meio
 * (Ahri: 3 de ataque e 8 de magia); um leve contraste aproxima do dano real.
 */
export function estimateDamage(champion: Pick<ChampionInfo, 'attack' | 'magic'>): DamageSplit {
  const total = champion.attack + champion.magic;
  const share = total > 0 ? champion.magic / total : 0.5;
  const ap = Math.min(0.95, Math.max(0.05, (share - 0.5) * 1.5 + 0.5));
  return { ap, ad: 1 - ap, true: 0, measured: false };
}

/**
 * Perfil de dano de um campeão sem precisar de injeção Angular (usa a base medida Mestre+
 * quando há ID conhecido, ou estima pelas notas de ataque e magia).
 */
export function baselineDamageOf(
  champion: { key?: number; attack?: number; magic?: number } | null | undefined,
): DamageSplit | null {
  if (!champion) return null;
  if (typeof champion.key === 'number' && BASELINE_DAMAGE[champion.key]) {
    const [ap, ad, t] = BASELINE_DAMAGE[champion.key];
    return { ap, ad, true: t, measured: true };
  }
  const attack = champion.attack ?? 0;
  const magic = champion.magic ?? 0;
  if (attack + magic <= 0) return null;
  return estimateDamage({ attack, magic });
}

export interface DamageProfile {
  damage: EnemyDamage;
  /** Fatia de dano mágico do time inimigo (0 a 1). */
  magicShare: number;
  /** Fatia de dano físico do time inimigo (0 a 1). */
  physicalShare: number;
  /** Fatia de dano verdadeiro do time inimigo (0 a 1). */
  trueShare: number;
}

type EnemyDamageInput =
  | (Partial<ChampionInfo> & { attack?: number; magic?: number; ap?: number; ad?: number; true?: number })
  | DamageSplit
  | null
  | undefined;

/**
 * Perfil de dano do time inimigo: usa o dano real medido nas partidas Mestre+ (via ChampionDamageService
 * ou pela base medida de `baselineDamageOf`), caindo para as notas do Data Dragon apenas se necessário.
 * Usa os mesmos cortes do servidor: 50% ou mais mágico (entre mágico e físico) é time de dano mágico,
 * 30% ou menos é time de dano físico.
 */
export function damageProfile(enemies: Array<EnemyDamageInput>): DamageProfile | null {
  const splits: Array<{ ap: number; ad: number; true: number }> = [];
  for (const e of enemies) {
    if (!e) continue;
    if (typeof e.ap === 'number' && typeof e.ad === 'number') {
      splits.push({ ap: e.ap, ad: e.ad, true: typeof e.true === 'number' ? e.true : Math.max(0, 1 - e.ap - e.ad) });
      continue;
    }
    const champ = e as { key?: number; attack?: number; magic?: number };
    if (typeof champ.key === 'number') {
      const real = baselineDamageOf(champ);
      if (real) {
        splits.push(real);
        continue;
      }
    }
    const attack = champ.attack ?? 0;
    const magic = champ.magic ?? 0;
    if (attack + magic > 0) {
      const ap = magic / (attack + magic);
      splits.push({ ap, ad: 1 - ap, true: 0 });
    }
  }
  if (splits.length < 2) return null;
  const apAvg = splits.reduce((sum, s) => sum + s.ap, 0) / splits.length;
  const adAvg = splits.reduce((sum, s) => sum + s.ad, 0) / splits.length;
  const trueAvg = splits.reduce((sum, s) => sum + s.true, 0) / splits.length;
  const mitigated = apAvg + adAvg;
  const magicShare = mitigated > 0 ? apAvg / mitigated : 0.5;
  return {
    magicShare: apAvg,
    physicalShare: adAvg,
    trueShare: trueAvg,
    damage: magicShare >= 0.5 ? 'ap' : magicShare <= 0.3 ? 'ad' : 'mixed',
  };
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
