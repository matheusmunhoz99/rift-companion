import type { RankEntry, RankedQueue } from '../core/app.types';

export interface SessionSummary {
  games: number;
  wins: number;
  losses: number;
  /** Soma das variações de PDL. */
  netLp: number;
  /** Derrotas seguidas mais recentes (0 se a última foi vitória). */
  lossStreak: number;
  /** 3 ou mais derrotas seguidas: hora de dar um tempo. */
  tilt: boolean;
}

/** Início do dia local (meia-noite) em ms. */
export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Entradas de uma fila, da mais nova para a mais antiga. */
export function forQueue(entries: RankEntry[], queue: RankedQueue): RankEntry[] {
  return entries.filter((e) => e.queue === queue).sort((a, b) => b.at - a.at);
}

/** Entradas de hoje de uma fila (mais novas primeiro). */
export function todayEntries(entries: RankEntry[], queue: RankedQueue, now = Date.now()): RankEntry[] {
  const since = startOfToday(now);
  return forQueue(entries, queue).filter((e) => e.at >= since);
}

/** Resumo de uma lista de partidas (vitórias, derrotas, PDL, sequência de derrotas). */
export function summarize(entries: RankEntry[]): SessionSummary {
  let wins = 0;
  let losses = 0;
  let netLp = 0;
  for (const e of entries) {
    if (e.win === true) wins++;
    else if (e.win === false) losses++;
    netLp += e.lpChange;
  }
  // entries vêm da mais nova para a mais antiga: conta derrotas desde a mais recente.
  let lossStreak = 0;
  for (const e of entries) {
    if (e.win === false) lossStreak++;
    else if (e.win === true) break;
  }
  return { games: entries.length, wins, losses, netLp, lossStreak, tilt: lossStreak >= 3 };
}

/** Rank atual de uma fila (a partida mais recente), ou null sem partidas. */
export function currentRank(entries: RankEntry[], queue: RankedQueue): RankEntry | null {
  return forQueue(entries, queue)[0] ?? null;
}

/** Pontos de PDL para o gráfico, do mais antigo ao mais novo (valor absoluto por partida). */
export function ladderSeries(entries: RankEntry[], queue: RankedQueue): Array<{ at: number; value: number }> {
  const list = forQueue(entries, queue).slice().reverse();
  let value = 0;
  // Reconstrói o valor relativo somando as variações (o ponto de partida é 0).
  return list.map((e) => {
    value += e.lpChange;
    return { at: e.at, value };
  });
}

const LADDER_TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
const LADDER_DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);
/** Mestre+ começa onde termina o Diamante I (7 elos x 4 divisões x 100 PDL). */
const APEX_BASE = LADDER_TIERS.length * 400;

/** Posição absoluta na escada: Ferro IV 0 PDL = 0, cada divisão vale 100, Mestre+ soma o PDL. */
export function ladderValue(entry: Pick<RankEntry, 'tier' | 'division' | 'lp'>): number | null {
  if (APEX_TIERS.has(entry.tier)) return APEX_BASE + entry.lp;
  const tier = LADDER_TIERS.indexOf(entry.tier);
  const division = LADDER_DIVISIONS.indexOf(entry.division);
  if (tier < 0 || division < 0) return null;
  return tier * 400 + division * 100 + entry.lp;
}

/** Elo e divisão de um ponto da escada (marcas do gráfico): 1300 -> PLATINUM I... */
export function ladderLabel(value: number): { tier: string; division: string | null } {
  if (value >= APEX_BASE) return { tier: 'MASTER', division: null };
  const tier = LADDER_TIERS[Math.max(0, Math.min(LADDER_TIERS.length - 1, Math.floor(value / 400)))];
  const division = LADDER_DIVISIONS[Math.floor((value % 400) / 100)];
  return { tier, division };
}

export interface LadderChart {
  /** Pontos de 0 a 100 nos dois eixos (o gráfico estica na largura). */
  points: Array<{ x: number; y: number; entry: RankEntry; value: number }>;
  /** Linhas de referência nas divisões (ou nos elos, se houver muitas). */
  grid: Array<{ y: number; value: number }>;
  /** Variação de posição no período, contando subidas e quedas de divisão. */
  net: number;
  wins: number;
  losses: number;
}

/** Gráfico da escada das últimas `limit` partidas da fila (mais antiga à esquerda). */
export function ladderChart(entries: RankEntry[], queue: RankedQueue, limit = 30): LadderChart | null {
  const list = forQueue(entries, queue)
    .slice(0, limit)
    .reverse()
    .map((entry) => ({ entry, value: ladderValue(entry) }))
    .filter((p): p is { entry: RankEntry; value: number } => p.value !== null);
  if (list.length < 2) return null;
  const values = list.map((p) => p.value);
  const pad = Math.max(12, (Math.max(...values) - Math.min(...values)) * 0.15);
  const min = Math.min(...values) - pad;
  const max = Math.max(...values) + pad;
  const y = (value: number) => +((1 - (value - min) / (max - min)) * 100).toFixed(2);
  const points = list.map((p, i) => ({ x: +((i / (list.length - 1)) * 100).toFixed(2), y: y(p.value), ...p }));
  // Divisões dentro da faixa; se forem muitas (subiu vários elos), só os elos.
  let step = 100;
  if (Math.floor(max / 100) - Math.ceil(min / 100) > 5) step = 400;
  const grid: LadderChart['grid'] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) grid.push({ y: y(v), value: v });
  const summary = summarize(list.map((p) => p.entry));
  return { points, grid, net: values[values.length - 1] - values[0], wins: summary.wins, losses: summary.losses };
}
