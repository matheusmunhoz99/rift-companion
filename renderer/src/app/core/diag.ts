/**
 * Evento do diagnóstico detalhado (opcional, desligado por padrão). O processo principal
 * descarta tudo se a pessoa não ligou a opção nas Configurações. Nunca lança.
 */
export function diag(
  kind: string,
  fields: { gameId?: number; matchId?: string; status?: number; ms?: number; detail?: unknown } = {},
): void {
  try {
    void window.app?.diagEvent?.(kind, fields)?.catch(() => undefined);
  } catch {
    // Diagnóstico nunca atrapalha a tela.
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
}
