import type { MatchParticipant, MatchSummary } from '../history/riot.types';

/**
 * "Seu momento" (Início): o que as suas últimas partidas dizem, calculado só com números
 * (sem IA): forma recente, melhor campeão, ritmo de farm do campeão mais jogado e um foco.
 */

export interface InsightRow {
  match: MatchSummary;
  me: MatchParticipant;
}

export interface Form {
  wins: number;
  games: number;
  /** Mesmo cálculo nas partidas anteriores (para a seta de tendência). */
  previousWins: number;
  previousGames: number;
  trend: 'up' | 'down' | 'flat';
}

export interface ChampionLine {
  championId: number;
  position: string | null;
  games: number;
  wins: number;
  kda: number;
  csPerMin: number;
  deaths: number;
}

export interface Insights {
  form: Form;
  best: ChampionLine | null;
  main: ChampionLine | null;
  avgDeaths: number;
}

/** Filas de Summoner's Rift com rota (farm comparável); ARAM e modos especiais ficam de fora. */
const RIFT_MAP = 11;
const FORM_SIZE = 10;
const MIN_BEST_GAMES = 3;
/** "Melhor campeão" só com pelo menos metade de vitórias (31% não é "melhor" de nada). */
const MIN_BEST_RATE = 0.5;

export function buildInsights(rows: InsightRow[]): Insights | null {
  const rift = rows.filter((r) => r.match.mapId === RIFT_MAP && r.match.gameDurationSeconds >= 600);
  if (rift.length < 3) return null;

  const recent = rift.slice(0, FORM_SIZE);
  const previous = rift.slice(FORM_SIZE, FORM_SIZE * 2);
  const rate = (list: InsightRow[]) => (list.length ? list.filter((r) => r.me.win).length / list.length : 0);
  const delta = previous.length >= 5 ? rate(recent) - rate(previous) : 0;
  const form: Form = {
    wins: recent.filter((r) => r.me.win).length,
    games: recent.length,
    previousWins: previous.filter((r) => r.me.win).length,
    previousGames: previous.length,
    trend: delta >= 0.15 ? 'up' : delta <= -0.15 ? 'down' : 'flat',
  };

  const byChampion = new Map<number, InsightRow[]>();
  for (const row of rift) byChampion.set(row.me.championId, [...(byChampion.get(row.me.championId) ?? []), row]);
  const lines = [...byChampion.entries()].map(([championId, list]) => line(championId, list));

  const main = lines.sort((a, b) => b.games - a.games || b.wins - a.wins)[0] ?? null;
  const best =
    lines
      .filter((l) => l.games >= MIN_BEST_GAMES && l.wins / l.games >= MIN_BEST_RATE)
      .sort((a, b) => b.wins / b.games - a.wins / a.games || b.kda - a.kda)[0] ?? null;

  const avgDeaths = rift.reduce((sum, r) => sum + r.me.deaths, 0) / rift.length;
  return { form, best, main, avgDeaths };
}

function line(championId: number, list: InsightRow[]): ChampionLine {
  const kills = list.reduce((s, r) => s + r.me.kills, 0);
  const deaths = list.reduce((s, r) => s + r.me.deaths, 0);
  const assists = list.reduce((s, r) => s + r.me.assists, 0);
  const minutes = list.reduce((s, r) => s + r.match.gameDurationSeconds / 60, 0);
  const cs = list.reduce((s, r) => s + r.me.cs, 0);
  const positions = new Map<string, number>();
  for (const r of list) if (r.me.position) positions.set(r.me.position, (positions.get(r.me.position) ?? 0) + 1);
  const position = [...positions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    championId,
    position,
    games: list.length,
    wins: list.filter((r) => r.me.win).length,
    kda: deaths === 0 ? kills + assists : (kills + assists) / deaths,
    csPerMin: minutes > 0 ? cs / minutes : 0,
    deaths: deaths / list.length,
  };
}

/** CS por minuto de referência Mestre+ (o minuto mais tarde até 20 com dado). */
export function benchmarkCsPerMin(benchmarks: Array<{ minute: number; cs: number }> | undefined): number | null {
  const point = (benchmarks ?? []).filter((b) => b.minute <= 20).sort((a, b) => b.minute - a.minute)[0];
  return point && point.minute > 0 ? point.cs / point.minute : null;
}

export type FocusKind = 'farm' | 'deaths' | 'form' | 'champion' | 'steady';

/** O ponto que mais vale a pena agora, em uma frase. `champion` é o nome do campeão mais jogado. */
export function focusOf(
  insights: Insights,
  champion: string,
  benchmark: number | null,
): { kind: FocusKind; text: string } {
  const main = insights.main;
  // Suporte farma pouco de propósito: não compara farm.
  if (main && benchmark && main.position !== 'utility' && main.csPerMin < benchmark * 0.85) {
    return {
      kind: 'farm',
      text: `Farm é o seu maior ganho agora: Mestre+ faz ${benchmark.toFixed(1)} CS/min de ${champion}; você está com ${main.csPerMin.toFixed(1)}.`,
    };
  }
  if (insights.avgDeaths >= 7) {
    return {
      kind: 'deaths',
      text: `Morrer menos vale mais que qualquer item: média de ${insights.avgDeaths.toFixed(1)} mortes por partida.`,
    };
  }
  if (insights.form.trend === 'down') {
    return { kind: 'form', text: 'Fase mais difícil nas últimas partidas: vale jogar com o campeão em que você mais confia.' };
  }
  if (insights.form.trend === 'up') {
    return { kind: 'form', text: `Você está em alta: ${insights.form.wins} vitórias nas últimas ${insights.form.games}.` };
  }
  if (insights.best && insights.best.wins / insights.best.games >= 0.6) {
    return { kind: 'champion', text: 'Seu melhor campeão do momento está rendendo: vale priorizar ele nas ranqueadas.' };
  }
  return { kind: 'steady', text: 'Partidas equilibradas: um foco por vez (farm, visão ou mortes) é o que destrava a subida.' };
}
