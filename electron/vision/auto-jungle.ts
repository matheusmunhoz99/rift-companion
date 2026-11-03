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
  /** Primeiro nascimento do campo (antes disso o número no minimapa é a contagem de nascimento). */
  firstSpawnOf?(key: string): number;
  now?(): number;
}

/** Campo com leitura sem confirmação: relê em 2 s (a segunda leitura confirma o horário). */
const REFRESH_UNSURE_MS = 2_000;
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

  /** Onde está o mapa no recorte (achado pela borda preta); null antes do primeiro quadro bom. */
  get mapBox(): MapBox | null {
    return this.box;
  }

  reset(): void {
    this.box = null;
    this.frames = 0;
    this.previous = new Set();
    this.absent = new Map();
    this.known = new Map();
    this.pending = new Map();
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
    // Sem horário confirmado (ou com leitura esperando a segunda): relê logo, para confirmar.
    const unsure = candidates.some((key) => !this.known.get(key)?.exact || this.pending.has(key));
    const due = fresh.length > 0 || (unsure && now - this.lastOcr >= REFRESH_UNSURE_MS) || now - this.lastOcr >= REFRESH_ALL_MS;
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

  /** Leitura nova que ainda não foi confirmada por uma segunda (a IA às vezes troca um dígito). */
  private pending = new Map<string, number>();

  private apply(key: string, text: string | null, gameTime: number, _justAppeared: boolean): void {
    // Antes de os campos nascerem, o minimapa mostra a contagem de nascimento, não de volta.
    if (gameTime < (this.deps.firstSpawnOf?.(key) ?? 0) + 3) return;
    const seconds = timerSeconds(text);
    // "2m+" não diz o segundo: espera o número exato (aparece com menos de 2 min).
    if (seconds === null) return;
    // Impossível: mais do que o tempo de volta do campo (leitura errada ou texto do vizinho).
    if (seconds < 1 || seconds > this.deps.respawnOf(key) + 3) return;
    const backAt = Math.round(gameTime + seconds);
    const current = this.known.get(key);
    const agrees = (a: number | undefined) => a !== undefined && Math.abs(a - backAt) <= 2;
    if (agrees(current?.backAt)) {
      this.pending.delete(key);
      return;
    }
    // Vale quando duas leituras seguidas concordam; uma só pode ser um dígito trocado.
    if (!agrees(this.pending.get(key))) {
      this.pending.set(key, backAt);
      return;
    }
    this.pending.delete(key);
    this.known.set(key, { backAt, exact: true });
    this.deps.emit(key, backAt, true);
  }
}
