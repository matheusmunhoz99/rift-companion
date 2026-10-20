const LANES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** Só aceita as cinco rotas; o jogo manda "", "NONE" ou "INVALID" quando não sabe. */
export function lanePosition(value: unknown): string {
  const lane = typeof value === 'string' ? value.toUpperCase() : '';
  return LANES.includes(lane) ? lane : '';
}
