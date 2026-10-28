import { BrowserWindow, globalShortcut, screen } from 'electron';
import type { LcuConnector } from '../lcu/connector';
import type { Preferences } from '../settings';
import { fetchRawGameData, toOverlayData } from './live-client';
import type { ObjectiveTimings } from './live-dashboard';
import { appLog } from '../app-log';

const POLL_MS = 2_000;
export const OVERLAY_WIDTH = 980;
export const OVERLAY_HEIGHT = 84;
const WIDTH = OVERLAY_WIDTH;
const HEIGHT = OVERLAY_HEIGHT;
export const OVERLAY_SHORTCUT = 'CommandOrControl+Shift+O';

/**
 * Overlay sem injeção: uma janela transparente, sempre por cima e que ignora
 * cliques, sobre o jogo em modo sem bordas. Não toca no processo do jogo.
 */
export class OverlayController {
  private window: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private hiddenByUser = false;
  /** A página do overlay terminou de carregar: antes disso a janela seria só um retângulo preto. */
  private ready = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly getPreferences: () => Preferences,
    private readonly loadPage: (window: BrowserWindow) => void,
    private readonly preloadPath: string,
    private readonly timings: () => Promise<ObjectiveTimings>,
  ) {
    connector.on('state', () => this.sync());
    globalShortcut.register(OVERLAY_SHORTCUT, () => this.toggleByUser());
  }

  /** Reavalia se o overlay deve estar ativo (fase da partida e configuração). */
  sync(): void {
    const phase = this.connector.getState().gameflowPhase;
    const shouldRun = this.getPreferences().overlayEnabled && (phase === 'InProgress' || phase === 'Reconnect');
    if (this.window && !this.window.isDestroyed()) this.applyLayout(this.window);
    if (shouldRun && !this.timer) {
      appLog(`overlay: ativo (fase ${phase})`);
      this.start();
    }
    if (!shouldRun && this.timer) {
      appLog(`overlay: parado (fase ${phase ?? '-'}, opção ${this.getPreferences().overlayEnabled ? 'ligada' : 'desligada'})`);
      this.stop();
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
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
    // Esconde em vez de destruir: criar/destruir janela transparente repetidamente
    // pode crashar o processo GPU do Chromium no Windows, deixando tudo preto.
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  private async poll(): Promise<void> {
    const raw = await fetchRawGameData();
    if (!raw?.allPlayers?.length || !this.timer) return;
    const data = toOverlayData(raw, await this.timings());
    if (!this.timer) return;
    const window = this.ensureWindow();
    window.webContents.send('overlay:data', data);
    if (this.hiddenByUser || !this.ready) return;
    if (!window.isVisible()) window.showInactive();
    window.setAlwaysOnTop(true, 'pop-up-menu');
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
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      alwaysOnTop: true,
      backgroundColor: '#000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.setAlwaysOnTop(true, 'pop-up-menu');
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason !== 'clean-exit' && !window.isDestroyed()) {
        appLog(`overlay: página caiu (${details.reason}), recarregando`);
        this.ready = false;
        window.webContents.reload();
      }
    });
    // Só aparece com a página pronta; a próxima leitura (2 s) já mostra os dados.
    this.ready = false;
    window.webContents.on('did-finish-load', () => {
      this.ready = true;
      appLog('overlay: página carregada');
    });
    this.applyLayout(window);
    this.loadPage(window);
    this.window = window;
    appLog('overlay: janela criada');
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
