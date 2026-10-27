import { ipcMain as nativeIpc, type IpcMainInvokeEvent } from 'electron';

type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any;
const handlers = new Map<string, Handler>();
const remoteHandlers = new Map<string, (...args: any[]) => any>();
export function mobileOverride(channel: string, handler: (...args: any[]) => any): void { remoteHandlers.set(channel, handler); }
/** One implementation for desktop IPC and the explicitly allowed Android operations. */
export const ipcMain = {
  handle(channel: string, handler: Handler): void {
    handlers.set(channel, handler);
    nativeIpc.handle(channel, handler);
  },
};

export const READ_CHANNELS = new Set([
  'lcu:get-state', 'prefs:get', 'app:info', 'app:game-window-mode', 'postgame:get',
  'lobby:queues', 'lobby:friends', 'lobby:champions', 'builds:get',
  'riot:get-settings', 'riot:find-player', 'riot:get-live-game', 'riot:get-local-game',
  'riot:get-live-dashboard', 'riot:get-premades', 'riot:get-matches',
  'stats:meta', 'stats:tierlist', 'stats:champion', 'stats:counters', 'stats:damage', 'telegram:status',
]);
const WRITE_CHANNELS = new Set([
  'prefs:set', 'app:launch-league', 'riot:set-platform',
  'lobby:create', 'lobby:leave', 'lobby:positions', 'lobby:search', 'lobby:invite', 'lobby:slot', 'lobby:ready-check',
  'champ-select:pick', 'champ-select:ban', 'champ-select:bench-swap', 'champ-select:reroll', 'champ-select:trade',
  'builds:apply-runes', 'builds:apply-items',
]);

export function invokeMobile(channel: string, args: unknown[], expectedPhase: string | null, phase: string | null): Promise<unknown> {
  if (!READ_CHANNELS.has(channel) && !WRITE_CHANNELS.has(channel)) throw new Error('Esta ação só está disponível no PC.');
  if (!Array.isArray(args) || args.length > 8) throw new Error('Argumentos inválidos.');
  if (WRITE_CHANNELS.has(channel) && expectedPhase !== phase) throw new Error('A fase do cliente mudou. Confira a tela e tente novamente.');
  if (channel === 'lobby:ready-check' && phase !== 'ReadyCheck') throw new Error('Não há partida para aceitar agora.');
  if (channel === 'lobby:search' && !['Lobby', 'Matchmaking'].includes(phase ?? '')) throw new Error('A fila mudou. Atualize a tela.');
  if (['lobby:create', 'lobby:leave', 'lobby:positions', 'lobby:slot'].includes(channel) &&
      ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect', 'ReadyCheck'].includes(phase ?? ''))
    throw new Error('Não é possível alterar a sala nesta fase.');
  if (channel === 'prefs:set') {
    const changes = args[0];
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Preferências inválidas.');
    // OS startup and desktop lifecycle stay local to the Windows app.
    if ('startWithWindows' in changes || 'minimizeToTray' in changes) throw new Error('Configure a inicialização e bandeja no PC.');
  }
  const handler = handlers.get(channel);
  if (!handler) throw new Error('Recurso ainda não disponível no PC.');
  const remote = remoteHandlers.get(channel);
  return Promise.resolve(remote ? remote(...args) : handler(undefined as unknown as IpcMainInvokeEvent, ...args));
}

export function readMobile(channel: string): Promise<unknown> { return invokeMobile(channel, [], null, null); }
