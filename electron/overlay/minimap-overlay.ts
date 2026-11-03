import { app, BrowserWindow, screen } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { appLog } from '../app-log';

/** Um timer desenhado em cima do minimapa, na posição do campo ou objetivo (0 a 1). */
export interface MinimapMark {
  u: number;
  v: number;
  text: string;
  /** ally = sua selva; enemy = selva inimiga; river = caranguejos; objective = dragão/Barão. */
  kind: 'ally' | 'enemy' | 'river' | 'objective';
  /** Faltam 15 s ou menos: destaca. */
  soon: boolean;
}

/** Retângulo do mapa na tela, em pixels físicos. */
export interface ScreenBox {
  x: number;
  y: number;
  size: number;
}

const PAGE = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;-webkit-user-select:none;user-select:none}
.m{position:absolute;transform:translate(-50%,-50%);padding:1px 5px;border-radius:6px;font:700 13px/1.15 "Segoe UI",system-ui,sans-serif;
  color:#fff;background:rgba(8,10,15,.78);border:1px solid rgba(255,255,255,.18);white-space:nowrap;text-shadow:0 1px 2px #000}
.ally{border-color:#4d8dff;color:#cfe0ff}.enemy{border-color:#f2475b;color:#ffd3d9}.river{border-color:#19d3c5;color:#c9fff9}
.objective{border-color:#ff8a5c;color:#ffd9c9;font-size:14px}.soon{background:rgba(47,212,138,.9);color:#04130b;border-color:#2fd48a}
</style><body><script>
const root = document.body;
window.minimapOverlay.onMarks((marks) => {
  root.replaceChildren(...marks.map((m) => {
    const el = document.createElement('span');
    el.className = 'm ' + m.kind + (m.soon ? ' soon' : '');
    el.style.left = (m.u * 100) + '%';
    el.style.top = (m.v * 100) + '%';
    el.textContent = m.text;
    return el;
  }));
});
</script>`;

/**
 * Overlay transparente exatamente em cima do minimapa, com os timers de cada campo e dos
 * objetivos no próprio lugar deles (como os apps de overlay fazem). É uma janela separada,
 * sempre por cima e que ignora o mouse: não injeta nada no jogo.
 */
export class MinimapOverlay {
  private window: BrowserWindow | null = null;
  private ready = false;
  private box: ScreenBox | null = null;

  constructor(private readonly preloadPath: string) {}

  /** Posição do mapa na tela (pixels físicos); o detector da visão acha a moldura. */
  place(box: ScreenBox | null): void {
    if (!box) return;
    const same = this.box && Math.abs(this.box.x - box.x) <= 2 && Math.abs(this.box.y - box.y) <= 2 && Math.abs(this.box.size - box.size) <= 2;
    this.box = box;
    if (!same && this.window && !this.window.isDestroyed()) this.applyBounds(this.window);
  }

  update(marks: MinimapMark[]): void {
    if (!this.box) return;
    const window = this.ensure();
    if (!this.ready) return;
    window.webContents.send('minimap-overlay:marks', marks);
    if (!window.isVisible()) window.showInactive();
    window.setAlwaysOnTop(true, 'screen-saver');
  }

  hide(): void {
    // Esconde em vez de destruir (criar e destruir janela transparente pode travar a GPU no Windows).
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  private ensure(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const window = new BrowserWindow({
      width: 200,
      height: 200,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: { preload: this.preloadPath, contextIsolation: true, sandbox: true },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.ready = false;
    window.webContents.on('did-finish-load', () => {
      this.ready = true;
    });
    const page = path.join(app.getPath('temp'), 'rift-companion-minimap.html');
    writeFileSync(page, PAGE);
    void window.loadFile(page);
    this.applyBounds(window);
    this.window = window;
    appLog('overlay do minimapa: janela criada');
    return window;
  }

  private applyBounds(window: BrowserWindow): void {
    if (!this.box) return;
    const scale = screen.getPrimaryDisplay().scaleFactor || 1;
    const origin = screen.getPrimaryDisplay().bounds;
    window.setBounds({
      x: Math.round(origin.x + this.box.x / scale),
      y: Math.round(origin.y + this.box.y / scale),
      width: Math.round(this.box.size / scale),
      height: Math.round(this.box.size / scale),
    });
  }
}

/** Poços dos objetivos no mapa (unidades do jogo): dragão embaixo; Barão, Arauto e Larvas em cima. */
const PITS: Record<string, { x: number; y: number }> = {
  dragon: { x: 9866, y: 4414 },
  baron: { x: 5007, y: 10471 },
  herald: { x: 5007, y: 10471 },
  grubs: { x: 5007, y: 10471 },
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}

/**
 * Marcas do minimapa: campos com timer (ordem do seu time) e os próximos objetivos.
 * `points` vem de campPoints(time) (posição de cada campo de 0 a 1).
 */
export function buildMarks(
  gameTime: number,
  camps: Array<{ key: string; backAt: number }>,
  objectives: Array<{ key: string; state: string; at: number }>,
  points: Array<{ key: string; u: number; v: number }>,
): MinimapMark[] {
  const marks: MinimapMark[] = [];
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const camp of camps) {
    const left = camp.backAt - gameTime;
    const point = byKey.get(camp.key);
    if (!point || left <= 0) continue;
    const side = camp.key.split(':')[0];
    marks.push({ u: point.u, v: point.v, text: clock(left), kind: side === 'ally' || side === 'enemy' ? side : 'river', soon: left <= 15 });
  }
  // Um objetivo por poço (o mais próximo de nascer).
  const seen = new Set<string>();
  for (const o of [...objectives].sort((a, b) => a.at - b.at)) {
    const pit = PITS[o.key];
    if (!pit || o.state !== 'upcoming' || o.at <= gameTime) continue;
    const place = `${pit.x},${pit.y}`;
    if (seen.has(place)) continue;
    seen.add(place);
    const left = o.at - gameTime;
    marks.push({ u: pit.x / 14870, v: 1 - pit.y / 14980, text: clock(left), kind: 'objective', soon: left <= 30 });
  }
  return marks;
}
