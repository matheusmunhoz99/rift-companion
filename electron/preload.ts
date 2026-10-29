import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('mobile', {
  pair: () => ipcRenderer.invoke('mobile:pair'),
  devices: () => ipcRenderer.invoke('mobile:devices'),
  approve: (id: string) => ipcRenderer.invoke('mobile:approve', id),
  revoke: (id: string) => ipcRenderer.invoke('mobile:revoke', id),
});

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('lcu', {
  getState: () => ipcRenderer.invoke('lcu:get-state'),
  onState: (callback: (state: unknown) => void) => subscribe('lcu:state', callback),
});

contextBridge.exposeInMainWorld('app', {
  info: () => ipcRenderer.invoke('app:info'),
  getPreferences: () => ipcRenderer.invoke('prefs:get'),
  setPreferences: (changes: unknown) => ipcRenderer.invoke('prefs:set', changes),
  openBuildsFolder: () => ipcRenderer.invoke('app:open-builds-folder'),
  launchLeague: () => ipcRenderer.invoke('app:launch-league'),
  report: (context: string, message: string, stack?: string) => ipcRenderer.invoke('app:report', context, message, stack),
  onAutoAccepted: (callback: (timestamp: number) => void) =>
    subscribe('auto-accept:accepted', callback),
  onOverlayData: (callback: (data: unknown) => void) => subscribe('overlay:data', callback),
  onPreferencesChanged: (callback: (preferences: unknown) => void) =>
    subscribe('prefs:changed', callback),
  onAutoRunesApplied: (callback: (result: unknown) => void) =>
    subscribe('auto-runes:applied', callback),
  gameWindowMode: () => ipcRenderer.invoke('app:game-window-mode'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: unknown) => void) => subscribe('update:status', callback),
});

contextBridge.exposeInMainWorld('lobby', {
  queues: () => ipcRenderer.invoke('lobby:queues'),
  friends: () => ipcRenderer.invoke('lobby:friends'),
  create: (queueId: number) => ipcRenderer.invoke('lobby:create', queueId),
  leave: () => ipcRenderer.invoke('lobby:leave'),
  setPositions: (first: string, second: string) => ipcRenderer.invoke('lobby:positions', first, second),
  search: (start: boolean) => ipcRenderer.invoke('lobby:search', start),
  invite: (summonerId: number) => ipcRenderer.invoke('lobby:invite', summonerId),
  readyCheck: (accept: boolean) => ipcRenderer.invoke('lobby:ready-check', accept),
  champions: () => ipcRenderer.invoke('lobby:champions'),
  setSlot: (index: number, championId: number, position: string) =>
    ipcRenderer.invoke('lobby:slot', index, championId, position),
});

contextBridge.exposeInMainWorld('champSelect', {
  ban: (championId: number) => ipcRenderer.invoke('champ-select:ban', championId),
  pick: (championId: number) => ipcRenderer.invoke('champ-select:pick', championId),
  benchSwap: (championId: number) => ipcRenderer.invoke('champ-select:bench-swap', championId),
  reroll: () => ipcRenderer.invoke('champ-select:reroll'),
  trade: (tradeId: number, action: string) =>
    ipcRenderer.invoke('champ-select:trade', tradeId, action),
});

contextBridge.exposeInMainWorld('riot', {
  getSettings: () => ipcRenderer.invoke('riot:get-settings'),
  setPlatform: (platformId: string) => ipcRenderer.invoke('riot:set-platform', platformId),
  findPlayer: (gameName: string, tagLine: string, platformId: string) =>
    ipcRenderer.invoke('riot:find-player', gameName, tagLine, platformId),
  getLiveGame: (gameName: string, tagLine: string, platformId: string) =>
    ipcRenderer.invoke('riot:get-live-game', gameName, tagLine, platformId),
  getLocalGame: () => ipcRenderer.invoke('riot:get-local-game'),
  getLiveDashboard: () => ipcRenderer.invoke('riot:get-live-dashboard'),
  getPostGame: () => ipcRenderer.invoke('postgame:get'),
  onPostGame: (callback: (game: unknown) => void) => subscribe('postgame:ready', callback),
  getPremades: (gameName: string, tagLine: string, platformId: string) =>
    ipcRenderer.invoke('riot:get-premades', gameName, tagLine, platformId),
  getMatches: (puuid: string, platformId: string, start: number, count: number) =>
    ipcRenderer.invoke('riot:get-matches', puuid, platformId, start, count),
});

contextBridge.exposeInMainWorld('telegram', {
  status: () => ipcRenderer.invoke('telegram:status'),
  connect: () => ipcRenderer.invoke('telegram:connect'),
  cancel: () => ipcRenderer.invoke('telegram:cancel'),
  test: () => ipcRenderer.invoke('telegram:test'),
  disconnect: () => ipcRenderer.invoke('telegram:disconnect'),
});

contextBridge.exposeInMainWorld('stats', {
  meta: () => ipcRenderer.invoke('stats:meta'),
  tierList: (position: string | null) => ipcRenderer.invoke('stats:tierlist', position),
  champion: (championId: number, position: string | null, opponentId?: number | null, damage?: string | null) =>
    ipcRenderer.invoke('stats:champion', championId, position, opponentId ?? null, damage ?? null),
  counters: (championId: number, position: string | null) =>
    ipcRenderer.invoke('stats:counters', championId, position),
  damage: () => ipcRenderer.invoke('stats:damage'),
});

contextBridge.exposeInMainWorld('riftUsers', {
  lookup: (riotIds: string[]) => ipcRenderer.invoke('users:lookup', riotIds),
});

contextBridge.exposeInMainWorld('builds', {
  get: (championId: number, position: string) =>
    ipcRenderer.invoke('builds:get', championId, position),
  applyRunes: (page: unknown, pageName: string, withSpells: boolean) =>
    ipcRenderer.invoke('builds:apply-runes', page, pageName, withSpells),
  applyItems: (championId: number, build: unknown) =>
    ipcRenderer.invoke('builds:apply-items', championId, build),
});
