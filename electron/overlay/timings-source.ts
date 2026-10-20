import type { LcuConnector } from '../lcu/connector';
import { lcuRequest } from '../lcu/http';
import { DEFAULT_TIMINGS_CONFIG, parseTimingsConfig, timingsForQueue, type ObjectiveTimings, type TimingsConfig } from './live-dashboard';

const TIMINGS_URL = `${process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br'}/downloads/timers.json`;
const TIMINGS_TTL_MS = 60 * 60_000;
const TIMINGS_RETRY_MS = 5 * 60_000;
const QUEUE_TTL_MS = 20_000;
let timingsCache: { at: number; ttl: number; value: TimingsConfig } | null = null;

/**
 * Tempos de surgimento dos objetivos publicados no nosso servidor (mesma pasta da
 * atualização automática), por fila, para corrigir uma mudança de temporada sem
 * lançar versão. Sem o arquivo ou sem internet, usa os tempos embutidos.
 */
async function timingsConfig(): Promise<TimingsConfig> {
  if (timingsCache && Date.now() - timingsCache.at < timingsCache.ttl) return timingsCache.value;
  try {
    const response = await fetch(TIMINGS_URL, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(String(response.status));
    timingsCache = { at: Date.now(), ttl: TIMINGS_TTL_MS, value: parseTimingsConfig(await response.json()) };
  } catch {
    timingsCache = { at: Date.now(), ttl: TIMINGS_RETRY_MS, value: timingsCache?.value ?? DEFAULT_TIMINGS_CONFIG };
  }
  return timingsCache.value;
}

/** Tempos da fila em andamento (a Partida Rápida tem objetivos próprios). */
export function createTimingsSource(connector: LcuConnector, isPackaged: boolean): () => Promise<ObjectiveTimings> {
  // Fila da partida pela sessão do cliente; não muda durante a partida.
  let queueCache: { at: number; id: number | null } | null = null;
  const currentQueue = async (): Promise<number | null> => {
    const demo = isPackaged ? undefined : process.env.RIFT_DEMO_QUEUE;
    if (demo) return Number(demo);
    if (queueCache && Date.now() - queueCache.at < QUEUE_TTL_MS) return queueCache.id;
    const credentials = connector.getCredentials();
    const session = credentials
      ? await lcuRequest<{ gameData?: { queue?: { id?: number } } }>(credentials, 'GET', '/lol-gameflow/v1/session').catch(() => null)
      : null;
    queueCache = { at: Date.now(), id: session?.gameData?.queue?.id ?? null };
    return queueCache.id;
  };
  return async () => {
    const [config, queueId] = await Promise.all([timingsConfig(), currentQueue()]);
    return timingsForQueue(config, queueId);
  };
}
