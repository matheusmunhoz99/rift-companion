import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { release } from 'node:os';

/**
 * Diagnóstico detalhado (opcional, desligado por padrão; a pessoa liga nas Configurações).
 *
 * Ligado, o app manda em lotes ao servidor o que acontece em cada partida — fases do
 * jogo, pedidos ao servidor (rota, status, tempo), falhas e o registro do app — junto com
 * o Riot ID da conta logada, e marca os pedidos com um código aleatório desta sessão
 * (cabeçalho X-Rift-Diag) para o servidor guardar o que fez para cada um. Serve para
 * achar onde algo falhou. O servidor apaga depois de 30 dias. Desligado, nada sai daqui.
 */

export interface DiagFields {
  gameId?: number | null;
  matchId?: string | null;
  status?: number | null;
  ms?: number | null;
  detail?: unknown;
}

interface DiagEvent extends DiagFields {
  at: number;
  kind: string;
}

interface DiagSource {
  enabled(): boolean;
  /** "Nome#TAG" da conta logada no LoL, ou null. */
  riotId(): string | null;
}

const FLUSH_MS = 20_000;
const BATCH = 200;
/** Guarda no máximo isto sem conseguir enviar (sem internet); os mais antigos saem. */
const MAX_QUEUE = 1_000;
const MAX_DETAIL = 6_000;

const session = randomUUID();
const queue: DiagEvent[] = [];
let source: DiagSource | null = null;
let apiUrl = '';
let flushing = false;
let wasEnabled = false;

/** Liga o envio periódico. `url` é a base do servidor (RIFT_API_URL). */
export function startDiagnostics(src: DiagSource, url: string): void {
  source = src;
  apiUrl = url;
  setInterval(() => void flushDiagnostics(), FLUSH_MS).unref();
}

export function diagEnabled(): boolean {
  try {
    return !!source?.enabled();
  } catch {
    return false;
  }
}

/** Cabeçalho para os pedidos ao servidor (vazio com o diagnóstico desligado). */
export function diagHeaders(): Record<string, string> {
  return diagEnabled() ? { 'X-Rift-Diag': session } : {};
}

/** Registra um evento (sem efeito com o diagnóstico desligado). Nunca lança. */
export function diagEvent(kind: string, fields: DiagFields = {}): void {
  if (!diagEnabled()) {
    wasEnabled = false;
    return;
  }
  try {
    if (!wasEnabled) {
      wasEnabled = true;
      queue.push({ at: Date.now(), kind: 'sessao', detail: { versao: appVersion(), sistema: systemInfo() } });
    }
    queue.push({ at: Date.now(), kind: kind.slice(0, 40), ...fields, detail: limitDetail(fields.detail) });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (queue.length >= 50) void flushDiagnostics();
  } catch {
    // O diagnóstico nunca atrapalha o app.
  }
}

/** Envia o que estiver na fila. Em falha de rede, devolve à fila para a próxima vez. */
export async function flushDiagnostics(): Promise<void> {
  if (flushing || queue.length === 0 || !apiUrl) return;
  if (!diagEnabled()) {
    queue.length = 0;
    return;
  }
  flushing = true;
  const batch = queue.splice(0, BATCH);
  try {
    const response = await fetch(`${apiUrl}/v1/diag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session,
        riotId: source?.riotId() ?? null,
        version: appVersion(),
        platform: systemInfo(),
        events: batch,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // 400 = lote recusado (não adianta reenviar); outros erros, tenta de novo depois.
    if (!response.ok && response.status !== 400) queue.unshift(...batch);
  } catch {
    queue.unshift(...batch);
  } finally {
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    flushing = false;
  }
}

/** Caminho de um pedido sem os PUUIDs inteiros (só o começo, para ligar as chamadas). */
export function diagPath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Mantém como veio.
  }
  return decoded.replace(/[A-Za-z0-9_-]{60,90}/g, (id) => `${id.slice(0, 8)}…`);
}

function appVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '?';
  }
}

function systemInfo(): string {
  return `${process.platform} ${release()} ${process.arch}`;
}

function limitDetail(detail: unknown): unknown {
  if (detail === undefined || detail === null) return null;
  try {
    const text = JSON.stringify(detail);
    return text.length > MAX_DETAIL ? { cortado: text.slice(0, MAX_DETAIL) } : detail;
  } catch {
    return { valor: String(detail).slice(0, 500) };
  }
}
