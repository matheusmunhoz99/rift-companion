/** Campeões com R desde o nível 1, sem R ou com quatro habilidades básicas: a regra comum não vale. */
const UNUSUAL = new Set(['jayce', 'elise', 'nidalee', 'udyr', 'karma', 'aphelios']);

/** "1,3,2" (Q, E, W) -> [0, 2, 1]. */
export function parseSkillKey(key: string | undefined): number[] {
  return (key ?? '').split(',').map((slot) => Number(slot) - 1).filter((i) => i >= 0 && i <= 3);
}

export function skillAdviceSupported(championKey: string): boolean {
  return !UNUSUAL.has(championKey.toLowerCase());
}

/**
 * Próxima habilidade a evoluir (0 = Q ... 3 = R) quando há ponto sobrando, ou null.
 * R nos níveis 6/11/16; as três primeiras seguem o início mais jogado e o resto,
 * a ordem de maximizar (uma básica só vai até metade do nível, arredondado para cima).
 */
export function nextSkill(level: number, skills: readonly number[], start: number[], order: number[]): number | null {
  const spent = skills.reduce((total, n) => total + n, 0);
  if (spent >= level || order.length === 0) return null;
  const ultimateMax = level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0;
  if ((skills[3] ?? 0) < ultimateMax) return 3;
  const basicMax = Math.min(5, Math.ceil(level / 2));
  const can = (i: number) => i < 3 && (skills[i] ?? 0) < basicMax;
  const opening = start[spent];
  if (spent < 3 && opening !== undefined && can(opening)) return opening;
  return [...order, 0, 1, 2].find(can) ?? null;
}
