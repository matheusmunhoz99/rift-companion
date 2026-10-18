// Espelha server/src/stats/queries.ts.
export interface StatsMeta {
  patches: string[];
  matches: number;
  players: number;
  region: string;
  tiers: string;
  queue: string;
}

export interface StatsOption {
  key: string;
  games: number;
  wins: number;
  winRate: number;
  share: number;
}

export interface TierEntry {
  championId: number;
  position: string;
  games: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: string;
}

export interface ChampionStats {
  championId: number;
  patches: string[];
  matches: number;
  position: string | null;
  positions: Array<{ position: string; games: number; winRate: number }>;
  games?: number;
  winRate?: number;
  pickRate?: number;
  banRate?: number;
  runes?: StatsOption[];
  spells?: StatsOption[];
  core?: StatsOption[];
  boots?: StatsOption[];
  start?: StatsOption[];
  skillOrder?: StatsOption[];
  skillStart?: StatsOption[];
  matchups?: Array<{ opponentId: number; games: number; winRate: number }>;
  opponent?: { opponentId: number; games: number; winRate: number | null; buildFromMatchup: boolean } | null;
  /** Itens contra o perfil de dano do time inimigo (só quando pedido). */
  situational?: Situational | null;
}

/** Perfil de dano do time inimigo: maioria mágico, maioria físico ou misto. */
export type EnemyDamage = 'ap' | 'ad' | 'mixed';

export interface Situational {
  damage: EnemyDamage;
  /** Partidas do campeão na rota contra esse perfil de dano. */
  games: number;
  items: Array<{ itemId: number; games: number; share: number; winRate: number; lift: number }>;
}

export interface StatsBridge {
  meta(): Promise<StatsMeta>;
  tierList(position: string | null): Promise<TierEntry[]>;
  champion(
    championId: number,
    position: string | null,
    opponentId?: number | null,
    damage?: EnemyDamage | null,
  ): Promise<ChampionStats | null>;
}

declare global {
  interface Window {
    stats?: StatsBridge;
  }
}

export const STATS_POSITIONS: Array<{ value: string; label: string }> = [
  { value: 'TOP', label: 'Topo' },
  { value: 'JUNGLE', label: 'Selva' },
  { value: 'MIDDLE', label: 'Meio' },
  { value: 'BOTTOM', label: 'Atirador' },
  { value: 'UTILITY', label: 'Suporte' },
];

export function statsPositionLabel(position: string | null): string {
  return STATS_POSITIONS.find((p) => p.value === position)?.label ?? '—';
}

/** Página de runas no formato da coleta: "primária|secundária|ids,separados". */
export function parseRuneKey(key: string): { primary: number; sub: number; perks: number[] } {
  const [primary, sub, perks] = key.split('|');
  return { primary: Number(primary), sub: Number(sub), perks: perks.split(',').map(Number) };
}

export function percent(value: number | undefined, digits = 1): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
}
