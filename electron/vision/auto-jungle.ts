import { cropAround, findMapBox, readCamps, timerSeconds, campPoints, type MapBox, type Team } from './camp-detector';

export interface OcrCrop {
  id: string;
  /** Recorte em RGBA. */
  rgba: Buffer;
  width: number;
  height: number;
}

export interface AutoJungleDeps {
  /** Lê o texto de cada recorte (IA no servidor); null = não deu para ler. */
  ocr(crops: OcrCrop[]): Promise<Array<{ id: string; text: string | null }> | null>;
  /** Campo morto: volta no tempo de jogo `backAt`; `exact` = lido do número na tela. */
  emit(key: string, backAt: number, exact: boolean): void;
  /** Tempo de volta do campo nesta fila (segundos). */
  respawnOf(key: string): number;
  now?(): number;
}

/** Sem novidade, ainda relê os timers aproximados ("2m+") a cada tanto. */
const REFRESH_INEXACT_MS = 8_000;
/** Releitura geral de segurança enquanto houver timers na tela. */
const REFRESH_ALL_MS = 30_000;

/** Recorta um retângulo de um bitmap RGBA. */
export function cropRgba(rgba: Buffer, width: number, rect: { x: number; y: number; width: number; height: number }): Buffer {
  const out = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    rgba.copy(out, y * rect.width * 4, ((rect.y + y) * width + rect.x) * 4, ((rect.y + y) * width + rect.x + rect.width) * 4);
  }
  return out;
}

/**
 * Selva automática pela tela: o detector local (1 quadro por segundo) vê onde apareceu texto
 * perto de um campo; só então os recortes desses campos vão para a IA ler o número. Com o
 * número ("1:57"), o horário de volta é exato: tempo do quadro + o que falta.
 */
export class AutoJungle {
  private box: MapBox | null = null;
  private frames = 0;
  private previous = new Set<string>();
  /** Quadros seguidos sem texto em cada campo (um ícone por cima some por 1 ou 2). */
  private absent = new Map<string, number>();
  private known = new Map<string, { backAt: number; exact: boolean }>();
  private busy = false;
  private lastOcr = 0;

  constructor(private readonly deps: AutoJungleDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  reset(): void {
    this.box = null;
    this.frames = 0;
    this.previous = new Set();
    this.absent = new Map();
    this.known = new Map();
    this.lastOcr = 0;
  }

  /** Um quadro do minimapa (RGBA), com o tempo de jogo dele e o seu time. */
  async frame(rgba: Buffer, width: number, height: number, gameTime: number, team: Team): Promise<void> {
    // A moldura do mapa não muda na partida: acha de novo de vez em quando (ou se perdeu).
    if (!this.box || this.frames % 30 === 0) this.box = findMapBox(rgba, width, height) ?? this.box;
    this.frames++;
    const box = this.box;
    if (!box) return;
    for (const [key, timer] of this.known) if (timer.backAt < gameTime - 5) this.known.delete(key);

    const points = campPoints(team);
    const readings = readCamps(rgba, width, height, box, points);
    const candidates = readings.filter((r) => r.glyphs > 0 && r.pixels >= 6).map((r) => r.key);
    const fresh = candidates.filter((key) => !this.previous.has(key));
    // "Acabou de morrer": texto novo depois de 5+ quadros sem nada ali, e não nos primeiros
    // quadros (o que já estava na tela quando o app começou a ver não tem hora de morte).
    const died = new Set(fresh.filter((key) => this.frames > 3 && (this.absent.get(key) ?? 0) >= 5));
    for (const r of readings) this.absent.set(r.key, candidates.includes(r.key) ? 0 : (this.absent.get(r.key) ?? 0) + 1);
    this.previous = new Set(candidates);
    if (this.busy || !candidates.length) return;

    const now = this.now();
    const inexact = candidates.some((key) => !this.known.get(key)?.exact);
    const due = fresh.length > 0 || (inexact && now - this.lastOcr >= REFRESH_INEXACT_MS) || now - this.lastOcr >= REFRESH_ALL_MS;
    if (!due) return;

    const byKey = new Map(points.map((p) => [p.key, p]));
    const crops = candidates.map((key) => {
      const rect = cropAround(box, byKey.get(key)!, width, height);
      return { id: key, rgba: cropRgba(rgba, width, rect), width: rect.width, height: rect.height };
    });
    this.busy = true;
    this.lastOcr = now;
    try {
      const results = await this.deps.ocr(crops);
      for (const result of results ?? []) this.apply(result.id, result.text, gameTime, died.has(result.id));
    } finally {
      this.busy = false;
    }
  }

  private apply(key: string, text: string | null, gameTime: number, justAppeared: boolean): void {
    const seconds = timerSeconds(text);
    const current = this.known.get(key);
    if (seconds !== null) {
      const backAt = Math.round(gameTime + seconds);
      if (!current || !current.exact || Math.abs(current.backAt - backAt) > 2) this.deps.emit(key, backAt, true);
      this.known.set(key, { backAt, exact: true });
      return;
    }
    // "2m+": mais de 2 min, sem o segundo. Se o texto acabou de aparecer, o campo acabou de morrer.
    if (text && /m\+$/.test(text) && justAppeared && !current) {
      const backAt = Math.round(gameTime + this.deps.respawnOf(key));
      this.known.set(key, { backAt, exact: false });
      this.deps.emit(key, backAt, false);
    }
  }
}
