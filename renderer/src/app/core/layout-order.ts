/**
 * Regras puras da ordem das seções (sem Angular, para testar no Node). Usadas por ScreenLayout.
 */

/**
 * Junta a ordem salva com as seções que existem hoje: tira o que não existe mais e põe cada
 * seção nova logo depois da vizinha que vinha antes dela na ordem padrão.
 */
export function mergeOrder(saved: unknown, ids: string[]): string[] {
  const order = [...new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [])];
  for (const [index, id] of ids.entries()) {
    if (order.includes(id)) continue;
    const before = ids.slice(0, index).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  }
  return order;
}

/** Move uma seção `delta` posições (negativo sobe). Fora dos limites: devolve a mesma ordem. */
export function moveIn(order: string[], id: string, delta: number): string[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
