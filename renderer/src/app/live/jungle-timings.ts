import type { JungleTimings } from '../history/riot.types';

/** buff = azul e vermelho; small = lobos e aves; large = sapo e krugs (nascem 12 s depois). */
export type CampKind = 'buff' | 'small' | 'large' | 'scuttle';

/**
 * Tempos do patch 26.1, usados quando o app (ou o servidor) não manda os da fila. A Partida
 * Rápida e as filas contra a IA têm volta mais rápida: o processo principal manda os certos.
 */
export const DEFAULT_JUNGLE: JungleTimings = {
  buffFirst: 55,
  buffRespawn: 300,
  smallCampFirst: 55,
  largeCampFirst: 67,
  campRespawn: 135,
  scuttleFirst: 175,
  scuttleRespawn: 150,
};

/** Primeiro surgimento e volta depois de morto (segundos de jogo) de um campo. */
export function campTiming(kind: CampKind, t: JungleTimings): { first: number; respawn: number } {
  switch (kind) {
    case 'buff':
      return { first: t.buffFirst, respawn: t.buffRespawn };
    case 'small':
      return { first: t.smallCampFirst, respawn: t.campRespawn };
    case 'large':
      return { first: t.largeCampFirst, respawn: t.campRespawn };
    default:
      return { first: t.scuttleFirst, respawn: t.scuttleRespawn };
  }
}

