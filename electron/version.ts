/**
 * Compara versões no formato x.y.z[-pre.n] (ex.: 0.3.0-beta.3).
 * Retorna > 0 se a for mais nova que b, < 0 se mais antiga e 0 se iguais.
 */
export function compareVersions(a: string, b: string): number {
  const [mainA, preA] = a.split('-', 2);
  const [mainB, preB] = b.split('-', 2);

  const diff = compareParts(mainA.split('.'), mainB.split('.'));
  if (diff !== 0) return diff;

  // Versão final (sem sufixo) é mais nova que qualquer pré-lançamento dela.
  if (!preA && !preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return compareParts(preA.split('.'), preB.split('.'));
}

function compareParts(a: string[], b: string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '0';
    const y = b[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    const diff = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
    if (diff !== 0) return diff;
  }
  return 0;
}
