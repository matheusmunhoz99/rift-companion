import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

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
  onAutoAccepted: (callback: (timestamp: number) => void) =>
    subscribe('auto-accept:accepted', callback),
  onOverlayData: (callback: (data: unknown) => void) => subscribe('overlay:data', callback),
});

contextBridge.exposeInMainWorld('champSelect', {
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
  getMatches: (puuid: string, platformId: string, start: number, count: number) =>
    ipcRenderer.invoke('riot:get-matches', puuid, platformId, start, count),
});

contextBridge.exposeInMainWorld('builds', {
  get: (championId: number, position: string) =>
    ipcRenderer.invoke('builds:get', championId, position),
  applyRunes: (page: unknown, pageName: string, withSpells: boolean) =>
    ipcRenderer.invoke('builds:apply-runes', page, pageName, withSpells),
  applyItems: (championId: number, build: unknown) =>
    ipcRenderer.invoke('builds:apply-items', championId, build),
});
