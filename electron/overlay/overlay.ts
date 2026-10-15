import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { LcuConnector } from '../lcu/connector';
import { fetchLiveClientData } from './live-client';

const POLL_MS = 2_000;
const WIDTH = 640;
const HEIGHT = 56;
export const OVERLAY_SHORTCUT = 'CommandOrControl+Shift+O';

/**
 * Overlay sem injeção: uma janela transparente, sempre por cima e que ignora
 * cliques, sobre o jogo em modo sem bordas. Não toca no processo do jogo.
 */
export class OverlayController {
  private window: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private hiddenByUser = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly isEnabled: () => boolean,
    private readonly loadPage: (window: BrowserWindow) => void,
    private readonly preloadPath: string,
  ) {
    connector.on('state', () => this.sync());
    globalShortcut.register(OVERLAY_SHORTCUT, () => this.toggleByUser());
  }

  /** Reavalia se o overlay deve estar ativo (fase da partida e configuração). */
  sync(): void {
    const phase = this.connector.getState().gameflowPhase;
    const shouldRun = this.isEnabled() && (phase === 'InProgress' || phase === 'Reconnect');
    if (shouldRun && !this.timer) this.start();
    if (!shouldRun && this.timer) this.stop();
  }

  dispose(): void {
    this.stop();
    globalShortcut.unregister(OVERLAY_SHORTCUT);
  }

  private start(): void {
    this.hiddenByUser = false;
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    void this.poll();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.window?.destroy();
    this.window = null;
  }

  private async poll(): Promise<void> {
    const data = await fetchLiveClientData();
    if (!data || !this.timer) return;
    const window = this.ensureWindow();
    window.webContents.send('overlay:data', data);
    if (!this.hiddenByUser && !window.isVisible()) window.showInactive();
  }

  private toggleByUser(): void {
    if (!this.window) return;
    this.hiddenByUser = this.window.isVisible();
    if (this.hiddenByUser) this.window.hide();
    else this.window.showInactive();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const { workArea } = screen.getPrimaryDisplay();
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
      y: workArea.y + 6,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.loadPage(window);
    this.window = window;
    return window;
  }
}
