import { screen, type BrowserWindow, type Rectangle } from 'electron';

/** Folga para "já ocupa a tela" e "a pessoa não mexeu" (bordas e arredondamento de DPI). */
const SLACK = 8;
const MAX_AUTO_RESTORES = 6;
const AUTO_RESTORE_WINDOW_MS = 15_000;

/** A janela já ocupa (quase) toda a área útil do monitor? */
export function fillsArea(bounds: Rectangle, area: Rectangle): boolean {
  return bounds.width >= area.width - SLACK && bounds.height >= area.height - SLACK;
}

/** Mesmo lugar e tamanho, com a folga de alguns pixels. */
export function sameBounds(a: Rectangle, b: Rectangle): boolean {
  return (
    Math.abs(a.x - b.x) <= SLACK &&
    Math.abs(a.y - b.y) <= SLACK &&
    Math.abs(a.width - b.width) <= SLACK &&
    Math.abs(a.height - b.height) <= SLACK
  );
}

/**
 * Modo partida: da seleção de campeões ao fim de jogo a janela cresce para a área útil do
 * monitor em que está, e volta ao tamanho de antes quando a partida termina.
 *
 * Usa setBounds em vez de maximize(): no Windows maximizar ativa a janela e tiraria o foco
 * do cliente (ou do jogo). Não mexe em janela escondida na bandeja, minimizada, maximizada
 * ou em tela cheia; e se a pessoa mover ou redimensionar a janela durante a partida, não
 * desfaz o que ela escolheu.
 */
export class MatchWindow {
  private saved: Rectangle | null = null;
  private applied: Rectangle | null = null;
  /** Tela cheia pedida (carregamento e jogo) e se fomos nós que a ligamos. */
  private fullscreenWanted = false;
  private fullscreenApplied = false;
  private waitingFocus: (() => void) | null = null;
  private onSecondaryDisplay = false;
  private userMinimized = false;
  private guardWindow: BrowserWindow | null = null;
  private guardHandlers: Array<{ event: 'minimize' | 'leave-full-screen' | 'restore' | 'focus'; fn: () => void }> = [];
  private restoreTimers: NodeJS.Timeout[] = [];
  private autoRestoreTimestamps: number[] = [];

  constructor(
    private readonly window: () => BrowserWindow | null,
    /** Área útil do monitor da janela (trocável nos testes). */
    private readonly workArea: (bounds: Rectangle) => Rectangle = (bounds) => screen.getDisplayMatching(bounds).workArea,
    /**
     * A janela está num monitor diferente do jogo? O LoL abre no monitor principal; num
     * segundo monitor dá para entrar em tela cheia na hora sem cobrir nem tirar o foco do jogo.
     */
    private readonly apartFromGame: (bounds: Rectangle) => boolean = (bounds) =>
      screen.getAllDisplays().length > 1 && screen.getDisplayMatching(bounds).id !== screen.getPrimaryDisplay().id,
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  /** Marca minimização explícita pelo usuário (ex.: Ctrl+Shift+R) para não reabrir sozinho. */
  allowMinimize(): void {
    this.userMinimized = true;
  }

  /** Windows/DirectX alterou métricas de vídeo durante o jogo: garante que a tela cheia no 2º monitor não caiu. */
  onDisplayMetricsChanged(): void {
    const win = this.window();
    if (!win || win.isDestroyed()) return;
    if (!this.fullscreenWanted || !this.fullscreenApplied || !this.onSecondaryDisplay || this.userMinimized) return;
    this.scheduleRestore(win, 200, 'mudança de vídeo');
  }

  dispose(): void {
    const win = this.window();
    if (win && !win.isDestroyed()) this.stopWaiting(win);
    this.detachGuard();
    this.clearTimers();
  }

  /**
   * Tela cheia de verdade (sem borda, barra de título nem barra de tarefas), como a do LoL,
   * no carregamento e durante o jogo. Num segundo monitor entra na hora e resiste a minimizações
   * do Windows/DirectX sem roubar o foco do jogo; no mesmo monitor do jogo espera você vir
   * para o app (Alt+Tab), para nunca cobrir o jogo nem tirar o foco dele.
   */
  fullscreen(on: boolean): boolean {
    const win = this.window();
    if (!win || win.isDestroyed()) return false;
    if (!on) {
      const was = this.fullscreenWanted;
      this.fullscreenWanted = false;
      this.userMinimized = false;
      this.onSecondaryDisplay = false;
      this.stopWaiting(win);
      this.detachGuard();
      this.clearTimers();
      if (this.fullscreenApplied && win.isFullScreen()) win.setFullScreen(false);
      this.fullscreenApplied = false;
      return was;
    }
    if (this.fullscreenWanted) return false;
    this.fullscreenWanted = true;
    this.userMinimized = false;
    this.autoRestoreTimestamps = [];
    const secondary = this.apartFromGame(win.getBounds());
    this.onSecondaryDisplay = secondary;

    if (secondary && (win.isVisible() || win.isMinimized())) {
      this.attachGuard(win);
      if (win.isMinimized()) {
        win.showInactive?.();
        if (win.isFullScreen()) this.fullscreenApplied = true;
      }
      this.applyFullscreen(win);
      const postTimer = setTimeout(() => {
        this.restoreTimers = this.restoreTimers.filter((t) => t !== postTimer);
        if (
          this.fullscreenWanted &&
          this.onSecondaryDisplay &&
          !this.userMinimized &&
          !win.isDestroyed() &&
          (win.isMinimized() || !win.isFullScreen())
        ) {
          this.recoverSecondaryFullscreen(win, 'início da partida');
        }
      }, 1_500);
      postTimer.unref();
      this.restoreTimers.push(postTimer);
    } else if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
      this.applyFullscreen(win);
    } else {
      this.waitingFocus = () => {
        this.waitingFocus = null;
        this.applyFullscreen(win);
      };
      win.once('focus', this.waitingFocus);
    }
    return true;
  }

  /** O modo partida está com a janela aumentada ou em tela cheia (não é a posição que você escolheu). */
  managing(): boolean {
    return this.saved !== null || this.fullscreenApplied;
  }

  private applyFullscreen(win: BrowserWindow): void {
    if (!this.fullscreenWanted || win.isDestroyed() || win.isFullScreen()) return;
    win.setFullScreen(true);
    this.fullscreenApplied = true;
  }

  private attachGuard(win: BrowserWindow): void {
    this.detachGuard();
    if (typeof win.on !== 'function') return;
    this.guardWindow = win;
    const onMinimize = () => {
      if (!this.fullscreenWanted || !this.onSecondaryDisplay || this.userMinimized) return;
      this.scheduleRestore(win, 80, 'minimizada durante o jogo');
      this.scheduleRestore(win, 450, 'minimizada durante o jogo');
    };
    const onLeaveFs = () => {
      if (
        !this.fullscreenWanted ||
        !this.fullscreenApplied ||
        !this.onSecondaryDisplay ||
        this.userMinimized ||
        win.isFocused()
      ) {
        return;
      }
      this.scheduleRestore(win, 120, 'saiu da tela cheia sem foco');
    };
    const onUserReturn = () => {
      this.userMinimized = false;
    };
    const entries: Array<{ event: 'minimize' | 'leave-full-screen' | 'restore' | 'focus'; fn: () => void }> = [
      { event: 'minimize', fn: onMinimize },
      { event: 'leave-full-screen', fn: onLeaveFs },
      { event: 'restore', fn: onUserReturn },
      { event: 'focus', fn: onUserReturn },
    ];
    for (const { event, fn } of entries) win.on(event as 'focus', fn);
    this.guardHandlers = entries;
  }

  private detachGuard(): void {
    const win = this.guardWindow;
    this.guardWindow = null;
    if (win && !win.isDestroyed() && typeof win.removeListener === 'function') {
      for (const { event, fn } of this.guardHandlers) win.removeListener(event as 'focus', fn);
    }
    this.guardHandlers = [];
  }

  private scheduleRestore(win: BrowserWindow, delayMs: number, reason: string): void {
    const timer = setTimeout(() => {
      this.restoreTimers = this.restoreTimers.filter((t) => t !== timer);
      this.recoverSecondaryFullscreen(win, reason);
    }, delayMs);
    timer.unref();
    this.restoreTimers.push(timer);
  }

  private recoverSecondaryFullscreen(win: BrowserWindow, reason: string): void {
    if (win.isDestroyed() || !this.fullscreenWanted || !this.onSecondaryDisplay || this.userMinimized) return;
    if (!win.isMinimized() && win.isVisible() && win.isFullScreen()) return;

    const now = Date.now();
    this.autoRestoreTimestamps = this.autoRestoreTimestamps.filter((t) => now - t < AUTO_RESTORE_WINDOW_MS);
    if (this.autoRestoreTimestamps.length >= MAX_AUTO_RESTORES) return;
    this.autoRestoreTimestamps.push(now);

    if (win.isMinimized() || !win.isVisible()) win.showInactive?.();
    if (!win.isFullScreen()) win.setFullScreen(true);
    this.fullscreenApplied = true;
    this.log(`modo partida: janela restaurada em tela cheia no 2º monitor (${reason})`);
  }

  private clearTimers(): void {
    for (const timer of this.restoreTimers) clearTimeout(timer);
    this.restoreTimers = [];
  }

  private stopWaiting(win: BrowserWindow): void {
    if (this.waitingFocus) win.removeListener('focus', this.waitingFocus);
    this.waitingFocus = null;
  }

  enter(): boolean {
    const win = this.window();
    if (!win || win.isDestroyed() || this.saved) return false;
    if (!win.isVisible() || win.isMinimized() || win.isMaximized() || win.isFullScreen()) return false;
    const bounds = win.getBounds();
    const area = this.workArea(bounds);
    if (fillsArea(bounds, area)) return false;
    this.saved = bounds;
    win.setBounds(area);
    this.applied = win.getBounds();
    return true;
  }

  leave(): boolean {
    const win = this.window();
    const saved = this.saved;
    const applied = this.applied;
    this.saved = null;
    this.applied = null;
    if (!win || win.isDestroyed() || !saved || !applied) return false;
    if (win.isMaximized() || win.isFullScreen() || !sameBounds(win.getBounds(), applied)) return false;
    win.setBounds(saved);
    return true;
  }
}
