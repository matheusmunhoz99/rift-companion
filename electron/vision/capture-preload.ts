import { contextBridge, ipcRenderer } from 'electron';

/** Janela escondida de captura: recebe a fonte da tela e devolve o recorte do minimapa por quadro. */
contextBridge.exposeInMainWorld('visionStream', {
  config: () => ipcRenderer.invoke('vision-stream:config'),
  frame: (data: ArrayBuffer, width: number, height: number, at: number) =>
    ipcRenderer.send('vision-stream:frame', data, width, height, at),
  failed: (message: string) => ipcRenderer.send('vision-stream:failed', message),
});
