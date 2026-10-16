import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { LcuConnector } from '../lcu/connector';
import type { Preferences } from '../settings';
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
    private readonly getPreferences: () => Preferences,
    private readonly loadPage: (window: BrowserWindow) => void,
    private readonly preloadPath: string,
  ) {
    connector.on('state', () => this.sync());
    globalShortcut.register(OVERLAY_SHORTCUT, () => this.toggleByUser());
  }

  /** Reavalia se o overlay deve estar ativo (fase da partida e configuração). */
  sync(): void {
    const phase = this.connector.getState().gameflowPhase;
    const shouldRun = this.getPreferences().overlayEnabled && (phase === 'InProgress' || phase === 'Reconnect');
    if (this.window && !this.window.isDestroyed()) this.applyLayout(this.window);
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
    if (this.hiddenByUser) return;
    if (!window.isVisible()) window.showInactive();
    // Jogos em tela cheia (com a otimização de tela cheia do Windows) tomam o topo;
    // reafirmar a cada atualização mantém o overlay visível quando o sistema permite.
    window.setAlwaysOnTop(true, 'screen-saver');
    window.moveTop();
  }

  private toggleByUser(): void {
    if (!this.window) return;
    this.hiddenByUser = this.window.isVisible();
    if (this.hiddenByUser) this.window.hide();
    else this.window.showInactive();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
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
    this.applyLayout(window);
    this.loadPage(window);
    this.window = window;
    return window;
  }

  /** Posição (esquerda, centro, direita) e opacidade escolhidas nas configurações. */
  private applyLayout(window: BrowserWindow): void {
    const { overlayPosition, overlayOpacity } = this.getPreferences();
    const { bounds } = screen.getPrimaryDisplay();
    const margin = 12;
    const x =
      overlayPosition === 'left'
        ? bounds.x + margin
        : overlayPosition === 'right'
          ? bounds.x + bounds.width - WIDTH - margin
          : Math.round(bounds.x + (bounds.width - WIDTH) / 2);
    window.setBounds({ x, y: bounds.y + 6, width: WIDTH, height: HEIGHT });
    window.setOpacity(overlayOpacity);
  }
}
