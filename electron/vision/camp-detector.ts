/**
 * Timers da selva lidos da tela: o próprio LoL escreve no minimapa quanto falta para cada
 * campo que o seu time viu morrer ("1:57", "40", "2m+"). O detector procura esse texto
 * branco no ponto de cada campo; quando ele aparece, o campo acabou de morrer, e o app conta
 * até ele voltar. Só lê pixels da tela (como um gravador): não toca no jogo.
 *
 * Tudo aqui é função pura sobre o bitmap BGRA do recorte do minimapa (testável).
 */

/** Tamanho do Summoner's Rift em unidades do jogo (x, y). */
const MAP_W = 14870;
const MAP_H = 14980;

export type Team = 'ORDER' | 'CHAOS';

/** Campos do lado azul (ORDER, base embaixo à esquerda); o lado vermelho é o espelho. */
const ORDER_CAMPS: Array<{ id: string; x: number; y: number }> = [
  { id: 'blue', x: 3800, y: 7900 },
  { id: 'gromp', x: 2100, y: 8400 },
  { id: 'wolves', x: 3800, y: 6500 },
  { id: 'raptors', x: 7000, y: 5400 },
  { id: 'red', x: 7800, y: 4000 },
  { id: 'krugs', x: 8400, y: 2700 },
];
const SCUTTLES: Array<{ id: string; x: number; y: number }> = [
  { id: 'scuttle-top', x: 4400, y: 9600 },
  { id: 'scuttle-bot', x: 10470, y: 5380 },
];

export interface CampPoint {
  /** Mesma chave da tela da selva: "ally:blue", "enemy:red", "river:scuttle-top". */
  key: string;
  /** Posição no mapa, de 0 a 1 (x da esquerda, y de cima). */
  u: number;
  v: number;
}

/** Os 14 campos com a chave do ponto de vista do seu time. */
export function campPoints(myTeam: Team): CampPoint[] {
  const point = (key: string, x: number, y: number): CampPoint => ({ key, u: x / MAP_W, v: 1 - y / MAP_H });
  const mirror = (c: { x: number; y: number }) => ({ x: MAP_W - c.x, y: MAP_H - c.y });
  const orderSide = myTeam === 'ORDER' ? 'ally' : 'enemy';
  const chaosSide = myTeam === 'ORDER' ? 'enemy' : 'ally';
  return [
    ...ORDER_CAMPS.map((c) => point(`${orderSide}:${c.id}`, c.x, c.y)),
    ...ORDER_CAMPS.map((c) => {
      const m = mirror(c);
      return point(`${chaosSide}:${c.id}`, m.x, m.y);
    }),
    ...SCUTTLES.map((c) => point(`river:${c.id}`, c.x, c.y)),
  ];
}

export interface MapBox {
  left: number;
  top: number;
  size: number;
}

const lumAt = (px: Uint8Array | Buffer, width: number, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return (px[i] + px[i + 1] + px[i + 2]) / 3;
};

/**
 * Acha o mapa dentro do recorte pela borda preta em volta dele (a moldura do minimapa tem
 * uma faixa quase preta de vários pixels). Funciona em qualquer escala do minimapa.
 */
export function findMapBox(px: Uint8Array | Buffer, width: number, height: number): MapBox | null {
  const profile = (vertical: boolean) => {
    const n = vertical ? height : width;
    const m = vertical ? width : height;
    const values: number[] = [];
    for (let a = 0; a < n; a++) {
      let s = 0;
      let count = 0;
      for (let b = Math.floor(m * 0.3); b < Math.floor(m * 0.7); b += 2) {
        s += vertical ? lumAt(px, width, b, a) : lumAt(px, width, a, b);
        count++;
      }
      values.push(s / count);
    }
    return values;
  };
  /** Faixas escuras (média < 4 por ≥ 3 pixels seguidos): [início, fim]. */
  const darkRuns = (values: number[]) => {
    const runs: Array<[number, number]> = [];
    let start = -1;
    values.forEach((v, i) => {
      if (v < 4) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start >= 3) runs.push([start, i - 1]);
        start = -1;
      }
    });
    if (start >= 0 && values.length - start >= 3) runs.push([start, values.length - 1]);
    return runs;
  };
  const cols = darkRuns(profile(false));
  const rows = darkRuns(profile(true));
  const pick = (runs: Array<[number, number]>, n: number) => {
    const first = runs.find(([, end]) => end < n * 0.5);
    const last = [...runs].reverse().find(([start]) => start > n * 0.5);
    return first && last ? { from: first[1] + 1, to: last[0] - 1 } : null;
  };
  const x = pick(cols, width);
  const y = pick(rows, height);
  if (!x || !y) return null;
  const w = x.to - x.from;
  const h = y.to - y.from;
  // O mapa é quadrado; uma borda falsa (algo escuro no jogo) desmancha o quadrado.
  if (w < width * 0.4 || h < height * 0.4 || Math.abs(w - h) > Math.max(w, h) * 0.08) return null;
  return { left: x.from, top: y.from, size: Math.round((w + h) / 2) };
}

/** Pixel do texto do timer: branco puro (o jogo desenha com contorno escuro). */
function isText(px: Uint8Array | Buffer, i: number): boolean {
  const b = px[i];
  const g = px[i + 1];
  const r = px[i + 2];
  return r > 205 && g > 205 && b > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

export interface CampReading {
  key: string;
  /** Há texto de timer no ponto do campo. */
  present: boolean;
  /** Pixels de texto nos componentes que parecem letras (para depurar e calibrar). */
  pixels: number;
  glyphs: number;
}

/**
 * Para cada campo, procura texto de timer numa janela em volta do ponto dele no minimapa.
 * Só contam componentes do tamanho de uma letra, com contorno escuro: a moldura branca da
 * câmera (linhas compridas) e os ícones de campeão (borda colorida) ficam de fora.
 */
export function readCamps(px: Uint8Array | Buffer, width: number, height: number, box: MapBox, points: CampPoint[]): CampReading[] {
  const radius = Math.max(8, Math.round(box.size * 0.06));
  const maxGlyph = Math.max(6, Math.round(box.size * 0.06));
  const minGlyph = Math.max(3, Math.round(box.size * 0.02));
  return points.map((point) => {
    const cx = Math.round(box.left + point.u * box.size);
    const cy = Math.round(box.top + point.v * box.size);
    const x0 = Math.max(0, cx - radius);
    const x1 = Math.min(width - 1, cx + radius);
    const y0 = Math.max(0, cy - radius);
    const y1 = Math.min(height - 1, cy + radius);
    const w = x1 - x0 + 1;
    const seen = new Uint8Array(w * (y1 - y0 + 1));
    let pixels = 0;
    let glyphs = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const local = (y - y0) * w + (x - x0);
        if (seen[local] || !isText(px, (y * width + x) * 4)) continue;
        // Componente conectado de pixels de texto (8 vizinhos).
        const stack = [[x, y]];
        seen[local] = 1;
        let count = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let edgeDark = 0;
        let edgeTotal = 0;
        while (stack.length) {
          const [sx, sy] = stack.pop()!;
          count++;
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = sx + dx;
              const ny = sy + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const ni = (ny * width + nx) * 4;
              if (isText(px, ni)) {
                if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) {
                  const nl = (ny - y0) * w + (nx - x0);
                  if (!seen[nl]) {
                    seen[nl] = 1;
                    stack.push([nx, ny]);
                  }
                }
              } else {
                edgeTotal++;
                if ((px[ni] + px[ni + 1] + px[ni + 2]) / 3 < 95) edgeDark++;
              }
            }
          }
        }
        const gw = maxX - minX + 1;
        const gh = maxY - minY + 1;
        const glyphLike =
          gh >= minGlyph && gh <= maxGlyph && gw <= maxGlyph && count >= 4 && edgeTotal > 0 && edgeDark / edgeTotal >= 0.45;
        if (glyphLike) {
          glyphs++;
          pixels += count;
        }
      }
    }
    return { key: point.key, present: glyphs >= 1 && pixels >= 8, pixels, glyphs };
  });
}

/**
 * Transforma leituras quadro a quadro em "o campo morreu agora": o texto precisa aparecer em
 * 2 quadros seguidos (um ícone passando por cima não engana) e sumir por 3 para zerar. Um
 * timer que já estava na tela quando o app começou a ver não conta (não sabemos quando morreu).
 */
export class CampTracker {
  private streak = new Map<string, number>();
  private gone = new Map<string, number>();
  private active = new Set<string>();
  private primed = false;

  update(readings: CampReading[]): string[] {
    const died: string[] = [];
    for (const r of readings) {
      if (r.present) {
        this.gone.set(r.key, 0);
        const streak = (this.streak.get(r.key) ?? 0) + 1;
        this.streak.set(r.key, streak);
        if (streak === 2 && !this.active.has(r.key)) {
          this.active.add(r.key);
          if (this.primed) died.push(r.key);
        }
      } else {
        this.streak.set(r.key, 0);
        const gone = (this.gone.get(r.key) ?? 0) + 1;
        this.gone.set(r.key, gone);
        if (gone >= 3) this.active.delete(r.key);
      }
    }
    // Os dois primeiros quadros só registram o que já estava na tela.
    if (!this.primed && [...this.streak.values()].length && this.frames++ >= 1) this.primed = true;
    return died;
  }

  private frames = 0;
}

/**
 * Pedaço da imagem em volta do campo para a IA ler o número: um pouco mais largo que alto
 * (o texto "1:57" é horizontal e às vezes sai um pouco abaixo do ícone).
 */
export function cropAround(box: MapBox, point: CampPoint, width: number, height: number) {
  // Medido nas amostras: o texto sai um pouco acima do ícone, e campos vizinhos (vermelho e
  // krugs, caranguejo e dragão) ficam a ~25 px; a faixa baixa não pega o número do vizinho.
  const w = Math.max(24, Math.round(box.size * 0.17));
  const h = Math.max(12, Math.round(box.size * 0.08));
  const cx = Math.round(box.left + point.u * box.size);
  const cy = Math.round(box.top + point.v * box.size) - Math.round(box.size * 0.025);
  const x = Math.min(Math.max(0, cx - Math.round(w / 2)), width - w);
  const y = Math.min(Math.max(0, cy - Math.round(h / 2)), height - h);
  return { x, y, width: w, height: h };
}

/** "1:57" -> 117, "40" -> 40; "2m+" -> null (mais de 2 min, sem o segundo exato). */
export function timerSeconds(text: string | null): number | null {
  if (!text) return null;
  const clock = /^(\d):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return /^\d{1,2}$/.test(text) ? Number(text) : null;
}
