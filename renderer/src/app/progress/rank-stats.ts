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
