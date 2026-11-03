import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { appLog } from '../app-log';

export interface StreamFrame {
  /** Recorte do minimapa em RGBA. */
  rgba: Buffer;
  width: number;
  height: number;
  /** Quando o quadro foi capturado (relógio do PC). */
  at: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Página da janela de captura: um vídeo da tela (como o compartilhamento de tela do Discord)
 * e, a cada segundo, só o recorte do minimapa vai para o processo principal. Bem mais leve
 * que tirar um print inteiro por vez.
 */
const PAGE = `<!doctype html><meta charset="utf-8"><body><video muted></video><canvas></canvas><script>
(async () => {
  try {
    const { sourceId, width, height, region, everyMs } = await window.visionStream.config();
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: 2 } });
    const video = document.querySelector('video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.querySelector('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    setInterval(() => {
      if (video.readyState < 2) return;
      const sx = region.x * video.videoWidth / width;
      const sy = region.y * video.videoHeight / height;
      const sw = region.width * video.videoWidth / width;
      const sh = region.height * video.videoHeight / height;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, region.width, region.height);
      const image = ctx.getImageData(0, 0, region.width, region.height);
      window.visionStream.frame(image.data.buffer, region.width, region.height, Date.now());
    }, everyMs);
  } catch (error) {
    window.visionStream.failed(String(error && error.message || error));
  }
})();
</script>`;

/** Captura contínua do canto do minimapa (1 quadro por segundo) durante a partida. */
export class MinimapStream {
  private window: BrowserWindow | null = null;
  private region: Region | null = null;
  private sourceId: string | null = null;
  private size = { width: 1920, height: 1080 };

  constructor(private readonly onFrame: (frame: StreamFrame) => void) {
    ipcMain.handle('vision-stream:config', () => ({
      sourceId: this.sourceId,
      width: this.size.width,
      height: this.size.height,
      region: this.region,
      everyMs: 1000,
    }));
    ipcMain.on('vision-stream:frame', (_event, data: ArrayBuffer, width: number, height: number, at: number) => {
      if (this.window && data && width > 0 && height > 0) this.onFrame({ rgba: Buffer.from(data), width, height, at });
    });
    ipcMain.on('vision-stream:failed', (_event, message: string) => {
      // Em alguns PCs o vídeo da tela não abre ("Could not start video source"): passa a
      // tirar um print só do canto a cada segundo (~0,3 s por print, uns 2% de CPU).
      appLog(`visão: vídeo da tela indisponível (${message}); usando prints do canto a cada 1 s`);
      const window = this.window;
      this.window = null;
      if (window && !window.isDestroyed()) window.destroy();
      this.startPolling();
    });
  }

  private polling: NodeJS.Timeout | null = null;

  get running(): boolean {
    return !!this.window || !!this.polling;
  }

  private startPolling(): void {
    if (this.polling || !this.region) return;
    const region = this.region;
    let busy = false;
    this.polling = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: this.size });
        const primary = String(screen.getPrimaryDisplay().id);
        const image = (sources.find((s) => s.display_id === primary) ?? sources[0])?.thumbnail;
        if (!image || !this.polling) return;
        const { width, height } = image.getSize();
        const sx = width / this.size.width;
        const sy = height / this.size.height;
        const rect = {
          x: Math.round(region.x * sx),
          y: Math.round(region.y * sy),
          width: Math.round(region.width * sx),
          height: Math.round(region.height * sy),
        };
        const crop = image.crop(rect);
        const bgra = crop.toBitmap();
        const { width: w, height: h } = crop.getSize();
        // BGRA (Windows) para RGBA, o formato dos quadros do vídeo.
        for (let i = 0; i < bgra.length; i += 4) {
          const b = bgra[i];
          bgra[i] = bgra[i + 2];
          bgra[i + 2] = b;
        }
        this.onFrame({ rgba: bgra, width: w, height: h, at: Date.now() });
      } catch (error) {
        appLog(`visão: falha no print: ${error instanceof Error ? error.message : error}`);
      } finally {
        busy = false;
      }
    }, 1000);
  }

  /** Começa a capturar o recorte `region` (pixels da tela principal). */
  async start(region: (screenWidth: number, screenHeight: number) => Region): Promise<void> {
    if (this.window) return;
    const primary = screen.getPrimaryDisplay();
    this.size = {
      width: Math.round(primary.size.width * primary.scaleFactor),
      height: Math.round(primary.size.height * primary.scaleFactor),
    };
    this.region = region(this.size.width, this.size.height);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    const source = sources.find((s) => s.display_id === String(primary.id)) ?? sources[0];
    this.sourceId = source?.id ?? null;
    if (!source) return;
    // Sessão só da captura: a tela principal (onde o jogo abre) é entregue sem perguntar.
    const captureSession = session.fromPartition('rift-vision');
    captureSession.setDisplayMediaRequestHandler((_request, callback) => callback({ video: source }));
    const window = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      skipTaskbar: true,
      webPreferences: {
        session: captureSession,
        preload: path.join(__dirname, 'capture-preload.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.window = window;
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    // Arquivo local (contexto seguro): numa página data: o navegador não libera a captura de tela.
    const page = path.join(app.getPath('temp'), 'rift-companion-vision.html');
    writeFileSync(page, PAGE);
    await window.loadFile(page);
    appLog('visão: captura contínua do minimapa ligada (1 quadro por segundo)');
  }

  stop(): void {
    if (this.polling) clearInterval(this.polling);
    this.polling = null;
    const window = this.window;
    this.window = null;
    if (window && !window.isDestroyed()) window.destroy();
  }
}
