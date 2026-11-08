/**
 * Modo de jogo pela fila e pelo mapa (espelha server/src/modes.ts, só o que a tela usa).
 * Decide o que faz sentido mostrar: rotas, etiquetas de função ("Main Selva", "Autofill") e
 * as estatísticas Mestre+, que vêm da Ranqueada Solo/Duo no Summoner's Rift.
 */
export type ModeKind = 'rift' | 'bots' | 'urf' | 'aram' | 'arena' | 'special';

export interface ModeInfo {
  kind: ModeKind;
  name: string;
  /** Tem rotas e selva (Summoner's Rift). */
  lanes: boolean;
  /** Fila com função escolhida/atribuída: "Autofill" e "Main <rota>" fazem sentido. */
  roles: boolean;
  /** Builds e winrates Mestre+ (Solo/Duo no Rift) valem neste modo. */
  riftStats: boolean;
}

const RIFT = (name: string, roles = true): ModeInfo => ({ kind: 'rift', name, lanes: true, roles, riftStats: true });
const ARAM = (name: string): ModeInfo => ({ kind: 'aram', name, lanes: false, roles: false, riftStats: false });
const URF = (name: string): ModeInfo => ({ kind: 'urf', name, lanes: true, roles: false, riftStats: false });
const BOTS: ModeInfo = { kind: 'bots', name: 'Cooperativo contra IA', lanes: true, roles: true, riftStats: true };
const ARENA: ModeInfo = { kind: 'arena', name: 'Arena', lanes: false, roles: false, riftStats: false };

const MODES: Record<number, ModeInfo> = {
  400: RIFT('Normal (Escolha)'),
  420: RIFT('Ranqueada Solo/Duo'),
  430: RIFT('Normal (Às Cegas)', false),
  440: RIFT('Ranqueada Flex'),
  480: RIFT('Partida Rápida'),
  490: RIFT('Partida Rápida'),
  700: RIFT('Clash'),
  830: BOTS,
  840: BOTS,
  850: BOTS,
  870: BOTS,
  880: BOTS,
  890: BOTS,
  450: ARAM('ARAM'),
  100: ARAM('ARAM (Ponte do Açougueiro)'),
  720: ARAM('Clash de ARAM'),
  2400: ARAM('ARAM: Desordem'),
  900: URF('ARURF'),
  1010: URF('ARURF de Neve'),
  1900: URF('URF'),
  1020: { kind: 'special', name: 'Um por Todos', lanes: true, roles: false, riftStats: false },
  1300: { kind: 'special', name: 'Nexus Blitz', lanes: false, roles: false, riftStats: false },
  1400: { kind: 'special', name: 'Grimório Supremo', lanes: true, roles: false, riftStats: false },
  1700: ARENA,
  1710: ARENA,
};

/** Filas sem rota no Abismo Uivante (para a partida pelos dados locais, antes do mapa chegar). */
export const ARAM_QUEUES = new Set([450, 100, 720, 2400]);

/**
 * A IA (plano, leitura ao vivo, coach) só roda nas filas do Summoner's Rift: Ranqueada Solo/Duo e
 * Flex, Normal, Partida Rápida e Clash. Espelha aiAllowed do servidor, que é quem decide.
 */
export function aiAllowed(queueId: number | null | undefined, mapId?: number | null, gameMode?: string | null): boolean {
  const known = queueId ? MODES[queueId] : undefined;
  if (known) return known.kind === 'rift';
  return mapId === 11 && (gameMode ?? 'CLASSIC').toUpperCase() === 'CLASSIC';
}

export function modeOf(queueId: number | null | undefined, mapId?: number | null): ModeInfo {
  const known = queueId ? MODES[queueId] : undefined;
  if (known) return known;
  if (mapId === 12 || mapId === 14) return ARAM('ARAM');
  if (mapId === 30) return ARENA;
  if (mapId === 11) return { kind: 'special', name: 'Modo especial', lanes: true, roles: false, riftStats: false };
  return { kind: 'special', name: 'Modo especial', lanes: false, roles: false, riftStats: false };
}
