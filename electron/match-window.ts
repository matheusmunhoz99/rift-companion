import { screen, type BrowserWindow, type Rectangle } from 'electron';

/** Folga para "já ocupa a tela" e "a pessoa não mexeu" (bordas e arredondamento de DPI). */
const SLACK = 8;

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

  constructor(
    private readonly window: () => BrowserWindow | null,
    /** Área útil do monitor da janela (trocável nos testes). */
    private readonly workArea: (bounds: Rectangle) => Rectangle = (bounds) => screen.getDisplayMatching(bounds).workArea,
  ) {}

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
