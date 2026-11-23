import type { MapBox, Team } from './camp-detector';

export type PixelOrder = 'bgra' | 'rgba';

export interface RadarPoint {
  u: number;
  v: number;
  gameTime: number;
  zone: string;
  confidence: number;
}

export interface ChampionTemplate {
  championKey: string;
  isJungler: boolean;
  size: number;
  /** Vetor normalizado (média 0, desvio 1) dos canais R, G, B dentro do círculo central. */
  pixels: Float32Array;
}

export interface JungleRadarState {
  active: boolean;
  black: boolean;
  championKey: string | null;
  championName: string | null;
  lastSeen: RadarPoint | null;
  trail: RadarPoint[];
}

export interface RingCandidate {
  cx: number;
  cy: number;
  radius: number;
  ringScore: number;
}

const TEMPLATE_SIZE = 16;

function readRgb(
  buf: Uint8Array | Buffer,
  width: number,
  x: number,
  y: number,
  order: PixelOrder,
): [number, number, number] {
  const i = (y * width + x) * 4;
  return order === 'bgra'
    ? [buf[i + 2], buf[i + 1], buf[i]]
    : [buf[i], buf[i + 1], buf[i + 2]];
}

function sampleBilinearRgb(
  buf: Uint8Array | Buffer,
  width: number,
  height: number,
  fx: number,
  fy: number,
  order: PixelOrder,
): [number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
  const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));

  const c00 = readRgb(buf, width, x0, y0, order);
  const c10 = readRgb(buf, width, x1, y0, order);
  const c01 = readRgb(buf, width, x0, y1, order);
  const c11 = readRgb(buf, width, x1, y1, order);

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  return [
    c00[0] * w00 + c10[0] * w10 + c01[0] * w01 + c11[0] * w11,
    c00[1] * w00 + c10[1] * w10 + c01[1] * w01 + c11[1] * w11,
    c00[2] * w00 + c10[2] * w10 + c01[2] * w01 + c11[2] * w11,
  ];
}

/**
 * Extrai e normaliza (média 0, variância 1 por vetor RGB completo) uma região circular
 * centrada em `(cx, cy)` com raio `radius` para um vetor de comprimento `size * size * 3`.
 * Pixels fora do círculo de raio `0.45 * size` são zerados para ignorar moldura e fundo.
 */
export function normalizeCircularPatch(
  buf: Uint8Array | Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  size = TEMPLATE_SIZE,
  order: PixelOrder = 'bgra',
): Float32Array {
  const out = new Float32Array(size * size * 3);
  const mask: number[] = [];
  const half = (size - 1) / 2;
  const maxR2 = (size * 0.45) ** 2;

  for (let py = 0; py < size; py++) {
    const dy = (py - half) / half;
    for (let px = 0; px < size; px++) {
      const dx = (px - half) / half;
      const dist2 = (px - half) ** 2 + (py - half) ** 2;
      if (dist2 > maxR2) continue;
      const [r, g, b] = sampleBilinearRgb(buf, width, height, cx + dx * radius, cy + dy * radius, order);
      const idx = (py * size + px) * 3;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      mask.push(idx);
    }
  }

  const count = mask.length * 3;
  if (count === 0) return out;

  let sum = 0;
  for (const idx of mask) sum += out[idx] + out[idx + 1] + out[idx + 2];
  const mean = sum / count;

  let sq = 0;
  for (const idx of mask) {
    out[idx] -= mean;
    out[idx + 1] -= mean;
    out[idx + 2] -= mean;
    sq += out[idx] * out[idx] + out[idx + 1] * out[idx + 1] + out[idx + 2] * out[idx + 2];
  }
  const norm = Math.sqrt(sq);
  if (norm > 1e-6) {
    for (const idx of mask) {
      out[idx] /= norm;
      out[idx + 1] /= norm;
      out[idx + 2] /= norm;
    }
  } else {
    for (const idx of mask) {
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
    }
  }
  return out;
}

/**
 * Monta o template normalizado (16×16) de um retrato quadrado de campeão do Data Dragon,
 * pegando os 76% centrais para descartar a borda quadrada escura da arte.
 */
export function buildChampionTemplate(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number,
  championKey: string,
  isJungler: boolean,
  size = TEMPLATE_SIZE,
  order: PixelOrder = 'bgra',
): ChampionTemplate {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) * 0.38;
  return {
    championKey,
    isJungler,
    size,
    pixels: normalizeCircularPatch(pixels, width, height, cx, cy, radius, size, order),
  };
}

export function nccScore(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

function isEnemyRed(r: number, g: number, b: number): boolean {
  return r >= 145 && r - g >= 55 && r - b >= 55;
}

const RING_SAMPLES = 16;
const RING_ANGLES = Array.from({ length: RING_SAMPLES }, (_, i) => {
  const a = (i / RING_SAMPLES) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)] as const;
});

function measureRingSupport(
  buf: Uint8Array | Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  order: PixelOrder,
): number {
  let hits = 0;
  for (const [cos, sin] of RING_ANGLES) {
    let matched = false;
    for (let dr = -1; dr <= 1; dr++) {
      const sx = Math.round(cx + cos * (r + dr));
      const sy = Math.round(cy + sin * (r + dr));
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const [red, green, blue] = readRgb(buf, width, sx, sy, order);
      if (isEnemyRed(red, green, blue)) {
        matched = true;
        break;
      }
    }
    if (matched) hits++;
  }
  return hits / RING_SAMPLES;
}

/**
 * Localiza círculos com anel vermelho inimigo dentro do quadrado `box` do minimapa.
 * Escala automaticamente com `box.size` (funciona de minimapa pequeno até 4K).
 */
export function findEnemyRingCandidates(
  buf: Uint8Array | Buffer,
  width: number,
  height: number,
  box: MapBox,
  order: PixelOrder = 'bgra',
): RingCandidate[] {
  if (width <= 0 || height <= 0 || buf.length < width * height * 4) return [];

  const r = Math.max(6, Math.round(box.size * 0.047));
  const step = Math.max(1, Math.floor(r / 4));
  const xMin = Math.max(r, Math.round(box.left + r));
  const xMax = Math.min(width - r - 1, Math.round(box.left + box.size - r));
  const yMin = Math.max(r, Math.round(box.top + r));
  const yMax = Math.min(height - r - 1, Math.round(box.top + box.size - r));

  // Primeiro acha pixels vermelhos e projeta para possíveis centros pelo raio esperado (topo/esquerda/baixo/direita).
  const candidateMap = new Map<string, { x: number; y: number; score: number }>();
  for (let y = Math.max(0, Math.round(box.top)); y <= Math.min(height - 1, Math.round(box.top + box.size)); y += step) {
    for (let x = Math.max(0, Math.round(box.left)); x <= Math.min(width - 1, Math.round(box.left + box.size)); x += step) {
      const [red, green, blue] = readRgb(buf, width, x, y, order);
      if (!isEnemyRed(red, green, blue)) continue;
      // O pixel vermelho pertence a uma borda de círculo -> tenta centros deslocados em ±r nos eixos principais.
      const offsets: Array<[number, number]> = [
        [x + r, y],
        [x - r, y],
        [x, y + r],
        [x, y - r],
      ];
      for (const [cx, cy] of offsets) {
        if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) continue;
        const bucket = `${Math.round(cx / step)},${Math.round(cy / step)}`;
        if (candidateMap.has(bucket)) continue;
        const support = measureRingSupport(buf, width, height, cx, cy, r, order);
        if (support >= 0.35) {
          candidateMap.set(bucket, { x: cx, y: cy, score: support });
        }
      }
    }
  }

  // Refinamento fino em torno de cada candidato aprovado + Non-Maximum Suppression.
  const refined: RingCandidate[] = [];
  for (const c of candidateMap.values()) {
    let bestX = c.x;
    let bestY = c.y;
    let bestR = r;
    let bestScore = c.score;
    const fine = Math.max(1, Math.floor(step / 2));
    for (let dy = -step; dy <= step; dy += fine) {
      for (let dx = -step; dx <= step; dx += fine) {
        const cx = c.x + dx;
        const cy = c.y + dy;
        if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) continue;
        for (const radius of [Math.max(5, r - 1), r, r + 1]) {
          const score = measureRingSupport(buf, width, height, cx, cy, radius, order);
          if (score > bestScore) {
            bestScore = score;
            bestX = cx;
            bestY = cy;
            bestR = radius;
          }
        }
      }
    }
    refined.push({ cx: bestX, cy: bestY, radius: bestR, ringScore: bestScore });
  }

  refined.sort((a, b) => b.ringScore - a.ringScore);
  const minDist2 = (r * 1.3) ** 2;
  const kept: RingCandidate[] = [];
  for (const c of refined) {
    if (kept.some((k) => (k.cx - c.cx) ** 2 + (k.cy - c.cy) ** 2 < minDist2)) continue;
    kept.push(c);
    if (kept.length >= 8) break;
  }
  return kept;
}

/** Nome legível da região do mapa onde `(u, v)` caiu, ajustado para o lado do seu time. */
export function zoneName(u: number, v: number, myTeam: Team): string {
  const x = Math.max(0, Math.min(1, u));
  const y = Math.max(0, Math.min(1, v));

  // Bases nos cantos opostos: (0,1) = ORDER (inferior esquerda), (1,0) = CHAOS (superior direita)
  if (x <= 0.2 && y >= 0.8) return myTeam === 'ORDER' ? 'Sua base' : 'Base inimiga';
  if (x >= 0.8 && y <= 0.2) return myTeam === 'CHAOS' ? 'Sua base' : 'Base inimiga';

  // Rios dos objetivos épicos (Barão cima-esquerda, Dragão baixo-direita)
  if ((x - 0.34) ** 2 + (y - 0.30) ** 2 <= 0.11 ** 2) return 'Rio do Barão / Larvas';
  if ((x - 0.66) ** 2 + (y - 0.70) ** 2 <= 0.11 ** 2) return 'Rio do Dragão';

  // Rotas externas e meio
  if ((x <= 0.18 && y <= 0.78) || (y <= 0.18 && x <= 0.78)) return 'Topo';
  if ((x >= 0.82 && y >= 0.22) || (y >= 0.82 && x >= 0.22)) return 'Bot';
  if (Math.abs(x + y - 1) <= 0.085) return 'Meio';

  // Meio corta de baixo-esquerda (0,1) ao topo-direita (1,0) -> u + v = 1.
  // O Rio corta de cima-esquerda (0,0) a baixo-direita (1,1) -> v > u indica metade ORDER.
  const onOrderHalf = v > u;
  const belowMid = u + v > 1;
  const isAllySide = myTeam === 'ORDER' ? onOrderHalf : !onOrderHalf;
  if (onOrderHalf) {
    // Metade ORDER: Blue acima do Mid (u+v < 1), Red abaixo do Mid (u+v > 1)
    return belowMid
      ? (isAllySide ? 'Sua selva vermelha' : 'Selva vermelha inimiga')
      : (isAllySide ? 'Sua selva azul' : 'Selva azul inimiga');
  } else {
    // Metade CHAOS: Blue abaixo do Mid (u+v > 1), Red acima do Mid (u+v < 1)
    return belowMid
      ? (isAllySide ? 'Sua selva azul' : 'Selva azul inimiga')
      : (isAllySide ? 'Sua selva vermelha' : 'Selva vermelha inimiga');
  }
}

/**
 * Compara cada anel vermelho inimigo visível no minimapa contra os 5 templates dos
 * campeões inimigos. Devolve a posição normalizada `(u, v)` quando o melhor match é o Jungler.
 */
export function detectJunglerInMinimap(
  buf: Uint8Array | Buffer,
  width: number,
  height: number,
  box: MapBox,
  templates: ChampionTemplate[],
  myTeam: Team,
  gameTime: number,
  order: PixelOrder = 'bgra',
): RadarPoint | null {
  if (!templates.length || box.size < 40) return null;
  const junglerTemplates = templates.filter((t) => t.isJungler);
  if (!junglerTemplates.length) return null;

  const candidates = findEnemyRingCandidates(buf, width, height, box, order);
  if (!candidates.length) return null;

  const size = templates[0].size;
  let bestHit: RadarPoint | null = null;

  for (const c of candidates) {
    const patch = normalizeCircularPatch(buf, width, height, c.cx, c.cy, c.radius * 0.78, size, order);
    let bestScore = -1;
    let bestTpl: ChampionTemplate | null = null;
    let secondEnemyScore = -1;

    for (const tpl of templates) {
      const score = nccScore(patch, tpl.pixels);
      if (score > bestScore) {
        if (bestTpl && !bestTpl.isJungler) secondEnemyScore = Math.max(secondEnemyScore, bestScore);
        bestScore = score;
        bestTpl = tpl;
      } else if (!tpl.isJungler && score > secondEnemyScore) {
        secondEnemyScore = score;
      }
    }

    if (!bestTpl || !bestTpl.isJungler) continue;
    const minScore = templates.length === 1 ? 0.45 : 0.36;
    const margin = templates.length === 1 ? 1 : bestScore - secondEnemyScore;
    if (bestScore < minScore || (templates.length > 1 && margin < 0.04)) continue;

    const u = Math.max(0, Math.min(1, (c.cx - box.left) / box.size));
    const v = Math.max(0, Math.min(1, (c.cy - box.top) / box.size));
    if (!bestHit || bestScore > bestHit.confidence) {
      bestHit = {
        u,
        v,
        gameTime,
        zone: zoneName(u, v, myTeam),
        confidence: Number(bestScore.toFixed(3)),
      };
    }
  }

  return bestHit;
}
