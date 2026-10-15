import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('lcu', {
  getState: () => ipcRenderer.invoke('lcu:get-state'),
  onState: (callback: (state: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on('lcu:state', listener);
    return () => ipcRenderer.removeListener('lcu:state', listener);
  },
});

contextBridge.exposeInMainWorld('autoAccept', {
  get: () => ipcRenderer.invoke('auto-accept:get'),
  set: (enabled: boolean) => ipcRenderer.invoke('auto-accept:set', enabled),
  onAccepted: (callback: (timestamp: number) => void) => {
    const listener = (_event: IpcRendererEvent, timestamp: number) => callback(timestamp);
    ipcRenderer.on('auto-accept:accepted', listener);
    return () => ipcRenderer.removeListener('auto-accept:accepted', listener);
  },
});

contextBridge.exposeInMainWorld('riot', {
  getSettings: () => ipcRenderer.invoke('riot:get-settings'),
  setPlatform: (platformId: string) => ipcRenderer.invoke('riot:set-platform', platformId),
  findPlayer: (gameName: string, tagLine: string, platformId: string) =>
    ipcRenderer.invoke('riot:find-player', gameName, tagLine, platformId),
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
