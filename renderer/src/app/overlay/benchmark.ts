import type { Benchmark } from '../stats/stats.types';

/** Depois do último minuto medido, a referência ainda vale por mais este tempo (pela tendência). */
const EXTRAPOLATE_MIN = 5;

/**
 * Valor esperado num minuto de jogo pela média Mestre+, ligando os minutos medidos
 * com retas a partir de `start` no minuto 0. Antes de 2 min ou longe do último
 * minuto medido, não há referência confiável.
 */
export function expectedAt(points: Benchmark[], minute: number, pick: (b: Benchmark) => number, start: number): number | null {
  if (points.length === 0 || minute < 2) return null;
  const line = [{ minute: 0, value: start }, ...points.map((b) => ({ minute: b.minute, value: pick(b) }))];
  const last = line[line.length - 1];
  if (minute > last.minute + EXTRAPOLATE_MIN) return null;
  const after = line.findIndex((p) => p.minute >= minute);
  const [a, b] = after > 0 ? [line[after - 1], line[after]] : [line[line.length - 2], last];
  return a.value + ((b.value - a.value) * (minute - a.minute)) / (b.minute - a.minute);
}
