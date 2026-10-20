export interface ChatTarget {
  host: string;
  port: number;
}

export interface PatchedClientConfig {
  body: string;
  target: ChatTarget | null;
}

export function parseClientConfig(body: string): Record<string, unknown> {
  const config = objectValue(JSON.parse(body));
  if (!config) throw new Error('Configuração da Riot não é um objeto JSON.');
  return config;
}

export function usesChatAffinity(config: Record<string, unknown>): boolean {
  return config['chat.affinity.enabled'] === true && objectValue(config['chat.affinities']) !== null;
}

/**
 * Troca o servidor XMPP recebido do clientconfig por um proxy local e conserva
 * o destino real para a outra ponta da conexão.
 */
export function patchClientConfig(
  config: Record<string, unknown>,
  localHost: string,
  localPort: number,
  affinity: string | null,
): PatchedClientConfig {
  if (!stringValue(localHost) || !numberValue(localPort)) throw new Error('Destino local de chat inválido.');
  // Não altera o objeto de origem nem seu mapa de afinidades.
  config = { ...config };
  const fallbackHost = stringValue(config['chat.host']);
  const port = numberValue(config['chat.port']);
  let targetHost = fallbackHost;

  const originalAffinities = objectValue(config['chat.affinities']);
  if (originalAffinities) {
    if (usesChatAffinity(config) && affinity && Object.hasOwn(originalAffinities, affinity)) {
      targetHost = stringValue(originalAffinities[affinity]) ?? targetHost;
    }
    config['chat.affinities'] = Object.fromEntries(Object.keys(originalAffinities).map((key) => [key, localHost]));
  }

  // Respostas parciais (ex.: só afinidades) ainda precisam apontar para o proxy;
  // como no Deceive, o destino real só é atualizado quando host e porta vêm juntos.
  if (fallbackHost) config['chat.host'] = localHost;
  if (port) config['chat.port'] = localPort;

  return {
    body: JSON.stringify(config),
    target: targetHost && port ? { host: targetHost, port } : null,
  };
}

/** Extrai o campo affinity do JWT do serviço PAS sem validar dados sensíveis. */
export function affinityFromJwt(raw: string): string | null {
  try {
    const token = raw.trim().replace(/^"|"$/g, '');
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { affinity?: unknown };
    return typeof json.affinity === 'string' && json.affinity ? json.affinity : null;
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
}
