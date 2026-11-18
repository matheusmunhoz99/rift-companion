import { readFileSync, writeFileSync } from 'node:fs';
import type { BrowserWindow, Rectangle } from 'electron';

/** Onde a janela estava: monitor (pela posição), tamanho e se estava maximizada. */
export interface WindowState extends Rectangle {
  maximized: boolean;
}

/** Quanto da barra de cima precisa estar dentro de um monitor para a posição valer. */
const VISIBLE_W = 160;
const VISIBLE_H = 40;
const SAVE_DELAY_MS = 500;

/** Lê o estado salvo; inválido ou sem arquivo, null (a janela abre no lugar padrão). */
export function loadWindowState(file: string): WindowState | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WindowState>;
    const numbers = [raw.x, raw.y, raw.width, raw.height];
    if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (raw.width! < 200 || raw.height! < 150) return null;
    return { x: raw.x!, y: raw.y!, width: raw.width!, height: raw.height!, maximized: raw.maximized === true };
  } catch {
    return null;
  }
}

/**
 * A posição salva ainda cai num monitor ligado? (Desconectou o segundo monitor ou mudou a
 * resolução: não abre a janela fora da tela.) Basta o começo da barra de cima estar visível.
 */
export function fitsSomeDisplay(state: Rectangle, workAreas: Rectangle[]): boolean {
  const top = { x: state.x, y: state.y, width: Math.min(state.width, VISIBLE_W), height: VISIBLE_H };
  return workAreas.some((area) => {
    const w = Math.min(top.x + top.width, area.x + area.width) - Math.max(top.x, area.x);
    const h = Math.min(top.y + top.height, area.y + area.height) - Math.max(top.y, area.y);
    return w >= top.width * 0.8 && h >= top.height * 0.8;
  });
}

/**
 * Encaixa a janela na área útil do monitor (sem a barra de tarefas): encolhe se for maior
 * e empurra para dentro se passar de alguma borda. Nunca menor que o mínimo da janela.
 */
export function clampToArea(bounds: Rectangle, area: Rectangle, min = { width: 760, height: 560 }): Rectangle {
  const width = Math.max(Math.min(bounds.width, area.width), Math.min(min.width, area.width));
  const height = Math.max(Math.min(bounds.height, area.height), Math.min(min.height, area.height));
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/**
 * Guarda onde a janela está sempre que você move, redimensiona ou maximiza, para abrir no
 * mesmo monitor e lugar da próxima vez. Ignora o que o app faz sozinho (modo partida
 * aumentando a janela ou em tela cheia) e a janela minimizada.
 */
export class WindowStateKeeper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly file: string,
    /** O app está mexendo na janela agora (modo partida): não salvar esse tamanho. */
    private readonly managedByApp: () => boolean = () => false,
  ) {}

  attach(win: BrowserWindow): void {
    const later = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.save(win), SAVE_DELAY_MS);
    };
    for (const event of ['move', 'resize', 'maximize', 'unmaximize'] as const) win.on(event as 'move', later);
    // Ao fechar, salva na hora (o timer não chegaria a rodar).
    win.on('close', () => {
      if (this.timer) clearTimeout(this.timer);
      this.save(win);
    });
  }

  save(win: BrowserWindow): void {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen() || this.managedByApp()) return;
    const maximized = win.isMaximized();
    // Maximizada: guarda o tamanho de antes de maximizar, para "restaurar" funcionar depois.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    try {
      writeFileSync(this.file, JSON.stringify({ ...bounds, maximized }));
    } catch {
      // Sem conseguir salvar: só abre no lugar padrão da próxima vez.
    }
  }
}
