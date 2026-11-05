import { lcuRequest } from './http';
import type { LcuCredentials } from './credentials';

/** Fases em que o jogo está aberto: a troca só valeria na próxima partida e pode confundir. */
const GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect', 'WaitingForStats']);

export type BorderlessResult = 'changed' | 'already' | 'in-game' | 'no-client';

/**
 * Troca o jogo para "Sem bordas" (WindowMode 2) pela mesma API que a tela de configurações
 * do cliente do LoL usa. Não mexe em arquivo do jogo; vale a partir da próxima partida.
 * Sem bordas tem o mesmo desempenho da tela cheia e deixa a selva automática ler o minimapa.
 */
export async function setBorderless(credentials: LcuCredentials | null, phase: string | null): Promise<BorderlessResult> {
  if (!credentials) return 'no-client';
  if (phase && GAME_PHASES.has(phase)) return 'in-game';
  const settings = await lcuRequest<{ General?: { WindowMode?: number } }>(credentials, 'GET', '/lol-game-settings/v1/game-settings');
  if (settings?.General?.WindowMode === 2) return 'already';
  await lcuRequest(credentials, 'PATCH', '/lol-game-settings/v1/game-settings', { General: { WindowMode: 2 } });
  // O cliente grava no arquivo quando a tela de configurações fecha; o "save" força a gravação já.
  await lcuRequest(credentials, 'POST', '/lol-game-settings/v1/save').catch(() => undefined);
  return 'changed';
}
