import type { CoachNarrationRequest, MatchSummary, PostGame, PostGamePlayer } from '../history/riot.types';
import { modeOf, type ModeInfo } from '../riot/modes';

/**
 * O "coach" do fim de jogo: compara a sua partida com a SUA média recente e
 * conta, de forma equilibrada, o que você mandou bem e o que dá pra evoluir.
 *
 * Regra de ouro: toda frase está ancorada num número real da partida — nada é
 * inventado. O objeto `CoachReport` é, de propósito, o mesmo payload que uma
 * camada de IA receberia mais tarde para narrar com mais calor (ver narrator.ts
 * no servidor): fatos prontos, para a IA só dar a voz, sem alucinar.
 */

export type Role = 'top' | 'jungle' | 'middle' | 'bottom' | 'utility';

export type MetricKey =
  | 'csPerMin'
  | 'kda'
  | 'killParticipation'
  | 'damagePerMin'
  | 'goldPerMin'
  | 'visionPerMin'
  | 'deaths';

/** Como o número é lido na tela: por minuto, razão (KDA/%), ou contagem. */
export type MetricUnit = 'perMin' | 'ratio' | 'percent' | 'count';

export interface CoachMetric {
  key: MetricKey;
  label: string;
  unit: MetricUnit;
  /** Valor desta partida. */
  value: number;
  /** Sua média recente na mesma fila. */
  average: number;
  /** Variação já normalizada: positivo = melhor que a média (mortes invertidas). */
  deltaPct: number;
  verdict: 'good' | 'neutral' | 'bad';
  lowerIsBetter: boolean;
}

export interface CoachInsight {
  tone: 'good' | 'bad' | 'neutral';
  text: string;
  metric?: MetricKey;
}

export interface CoachReport {
  /** Quantas partidas entraram na média (a base da comparação). */
  games: number;
  role: Role | null;
  queueId: number | null;
  overall: { verdict: 'above' | 'onpar' | 'below'; deltaPct: number; text: string };
  metrics: CoachMetric[];
  /** O que você mandou bem (equilibrado: começa pelo positivo). */
  wins: CoachInsight[];
  /** O próximo passo — honesto sobre o que pesou. */
  improve: CoachInsight[];
  /** Comemorações factuais: multiabate, melhor farm do período, etc. */
  highlights: CoachInsight[];
}

/** Mínimo de partidas na base para a comparação fazer sentido. */
export const MIN_BASELINE_GAMES = 3;
/** Quantas partidas recentes puxar para montar a média. */
export const BASELINE_SIZE = 20;
/** Fora desta banda (±), a partida conta como acima/abaixo da média. */
const BAND = 0.07;

const ROLES: Role[] = ['top', 'jungle', 'middle', 'bottom', 'utility'];

/** Quais métricas pesam mais por função (define a ordem de destaque). */
const ROLE_PRIORITY: Record<Role, MetricKey[]> = {
  top: ['csPerMin', 'damagePerMin', 'deaths', 'kda', 'killParticipation', 'goldPerMin', 'visionPerMin'],
  jungle: ['killParticipation', 'visionPerMin', 'deaths', 'damagePerMin', 'csPerMin', 'goldPerMin', 'kda'],
  middle: ['damagePerMin', 'csPerMin', 'kda', 'killParticipation', 'deaths', 'goldPerMin', 'visionPerMin'],
  bottom: ['damagePerMin', 'csPerMin', 'kda', 'killParticipation', 'deaths', 'goldPerMin', 'visionPerMin'],
  utility: ['visionPerMin', 'killParticipation', 'deaths', 'kda', 'goldPerMin', 'damagePerMin', 'csPerMin'],
};
/** Sem função conhecida (ARAM, autofill sem dado): ordem geral. */
const DEFAULT_PRIORITY: MetricKey[] = ['damagePerMin', 'kda', 'csPerMin', 'killParticipation', 'visionPerMin', 'deaths', 'goldPerMin'];

const METRIC_LABEL: Record<MetricKey, string> = {
  csPerMin: 'CS por minuto',
  kda: 'KDA',
  killParticipation: 'Participação em abates',
  damagePerMin: 'Dano por minuto',
  goldPerMin: 'Ouro por minuto',
  visionPerMin: 'Visão por minuto',
  deaths: 'Mortes',
};

const METRIC_UNIT: Record<MetricKey, MetricUnit> = {
  csPerMin: 'perMin',
  kda: 'ratio',
  killParticipation: 'percent',
  damagePerMin: 'perMin',
  goldPerMin: 'perMin',
  visionPerMin: 'perMin',
  deaths: 'count',
};

const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  csPerMin: false,
  kda: false,
  killParticipation: false,
  damagePerMin: false,
  goldPerMin: false,
  visionPerMin: false,
  deaths: true,
};

interface Sample {
  csPerMin: number;
  kda: number;
  killParticipation: number;
  damagePerMin: number;
  goldPerMin: number;
  visionPerMin: number;
  deaths: number;
}

const ORDER: MetricKey[] = ['csPerMin', 'kda', 'killParticipation', 'damagePerMin', 'goldPerMin', 'visionPerMin', 'deaths'];

/** Modo da partida terminada: pela fila; fila desconhecida, pelo modo que o cliente informa. */
export function postGameMode(game: Pick<PostGame, 'queueId' | 'gameMode'>): ModeInfo {
  const mode = game.gameMode?.toUpperCase() ?? '';
  const mapId = /^(ARAM|KIWI)$/.test(mode) ? 12 : mode === 'CHERRY' ? 30 : mode === 'CLASSIC' ? 11 : null;
  return modeOf(game.queueId, mapId);
}

/** Minutos de uma partida (mínimo 1 para não dividir por zero). */
function minutes(seconds: number): number {
  return Math.max(1, seconds / 60);
}

/** Métricas desta partida a partir do placar do cliente (eog). */
export function sampleFromPostGame(me: PostGamePlayer, durationSeconds: number): Sample {
  const min = minutes(durationSeconds);
  return {
    csPerMin: me.cs / min,
    kda: (me.kills + me.assists) / Math.max(1, me.deaths),
    killParticipation: Math.min(1, me.killShare),
    damagePerMin: me.damageToChampions / min,
    goldPerMin: me.gold / min,
    visionPerMin: me.vision / min,
    deaths: me.deaths,
  };
}

/** Métricas de uma partida do histórico (match-v5) para o jogador. */
function sampleFromMatch(match: MatchSummary, puuid: string): Sample | null {
  const me = match.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const min = minutes(match.gameDurationSeconds);
  const teamKills = match.participants
    .filter((p) => p.teamId === me.teamId)
    .reduce((sum, p) => sum + p.kills, 0);
  return {
    csPerMin: me.cs / min,
    kda: (me.kills + me.assists) / Math.max(1, me.deaths),
    killParticipation: teamKills ? Math.min(1, (me.kills + me.assists) / teamKills) : 0,
    damagePerMin: me.damageToChampions / min,
    goldPerMin: me.gold / min,
    visionPerMin: me.visionScore / min,
    deaths: me.deaths,
  };
}

/** Função principal do jogador pela moda das posições recentes. */
function inferRole(matches: MatchSummary[], puuid: string): Role | null {
  const counts = new Map<Role, number>();
  for (const match of matches) {
    const me = match.participants.find((p) => p.puuid === puuid);
    const role = me?.position as Role | undefined;
    if (role && ROLES.includes(role)) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  let best: Role | null = null;
  let top = 0;
  for (const [role, n] of counts) if (n > top) ((top = n), (best = role));
  return best;
}

/** Exclui a própria partida do histórico (matchId termina em _<gameId>). */
function withoutCurrent(matches: MatchSummary[], gameId: number): MatchSummary[] {
  const suffix = `_${gameId}`;
  return matches.filter((m) => !m.matchId.endsWith(suffix));
}

function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Monta a comparação da partida com a sua média recente; null se faltam dados.
 * `puuid` é o PUUID da Riot API (o do histórico), não o do cliente do LoL — por
 * isso vem de fora (findPlayer), e não do placar do fim de jogo.
 */
export function buildCoachReport(game: PostGame, recent: MatchSummary[], puuid: string): CoachReport | null {
  const me = game.players.find((p) => p.isMe);
  if (!me || !puuid) return null;

  // A base: mesma fila (quando sabida), sem a partida atual, com amostra mínima.
  const sameQueue = game.queueId
    ? recent.filter((m) => m.queueId === game.queueId)
    : recent;
  const pool = withoutCurrent(sameQueue.length >= MIN_BASELINE_GAMES ? sameQueue : recent, game.gameId);
  const samples = pool
    .slice(0, BASELINE_SIZE)
    .map((m) => sampleFromMatch(m, puuid))
    .filter((s): s is Sample => s !== null);
  if (samples.length < MIN_BASELINE_GAMES) return null;

  const role = inferRole(pool, puuid);
  const current = sampleFromPostGame(me, game.durationSeconds);
  const average = averageOf(samples);

  // Sem rotas (ARAM, Arena...) não há sentinelas: visão não entra na conta nem nas dicas.
  const mode = postGameMode(game);
  const keys = mode.lanes ? ORDER : ORDER.filter((key) => key !== 'visionPerMin');
  const metrics = keys.map((key) => toMetric(key, current[key], average[key]));
  const report: CoachReport = {
    games: samples.length,
    role,
    queueId: game.queueId,
    overall: overallOf(metrics, role),
    metrics,
    wins: [],
    improve: [],
    highlights: highlightsOf(me, current, samples, game),
  };
  fillInsights(report, me, mode);
  return report;
}

function averageOf(samples: Sample[]): Sample {
  const sum: Sample = { csPerMin: 0, kda: 0, killParticipation: 0, damagePerMin: 0, goldPerMin: 0, visionPerMin: 0, deaths: 0 };
  for (const s of samples) for (const key of ORDER) sum[key] += s[key];
  const avg = { ...sum };
  for (const key of ORDER) avg[key] = sum[key] / samples.length;
  return avg;
}

function toMetric(key: MetricKey, value: number, average: number): CoachMetric {
  const lowerIsBetter = LOWER_IS_BETTER[key];
  // delta normalizado: + sempre significa "melhor" (para mortes, menos é melhor).
  let deltaPct = 0;
  if (average > 0) deltaPct = (lowerIsBetter ? average - value : value - average) / average;
  const verdict = deltaPct >= BAND ? 'good' : deltaPct <= -BAND ? 'bad' : 'neutral';
  return { key, label: METRIC_LABEL[key], unit: METRIC_UNIT[key], value, average, deltaPct, verdict, lowerIsBetter };
}

/** Nota geral da forma: média ponderada dos deltas (mais peso para a função). */
function overallOf(metrics: CoachMetric[], role: Role | null): CoachReport['overall'] {
  const priority = role ? ROLE_PRIORITY[role] : DEFAULT_PRIORITY;
  let weighted = 0;
  let total = 0;
  for (const metric of metrics) {
    const rank = priority.indexOf(metric.key);
    const weight = rank < 0 ? 1 : priority.length - rank;
    weighted += metric.deltaPct * weight;
    total += weight;
  }
  const deltaPct = total ? weighted / total : 0;
  const verdict = deltaPct >= BAND ? 'above' : deltaPct <= -BAND ? 'below' : 'onpar';
  const text =
    verdict === 'above'
      ? 'No geral, essa partida ficou acima da sua média recente. Bom ritmo — segue assim.'
      : verdict === 'below'
        ? 'No geral, ficou um pouco abaixo da sua média recente. Nada que um ajuste não resolva nos próximos jogos.'
        : 'No geral, uma partida dentro da sua média. Consistência também é evolução.';
  return { verdict, deltaPct, text };
}

/** Comemorações factuais (só entram se o número confirmar). */
function highlightsOf(me: PostGamePlayer, current: Sample, samples: Sample[], game: PostGame): CoachInsight[] {
  const list: CoachInsight[] = [];
  const MULTI: Record<number, string> = { 2: 'Abate duplo', 3: 'Abate triplo', 4: 'Abate quádruplo', 5: 'Pentakill' };
  if (me.largestMultiKill >= 2) list.push({ tone: 'good', text: `${MULTI[Math.min(5, me.largestMultiKill)]} nesta partida.` });
  if (me.deaths === 0) list.push({ tone: 'good', text: 'KDA perfeito: você não morreu nenhuma vez.' });
  const bestCs = Math.max(...samples.map((s) => s.csPerMin));
  if (current.csPerMin > bestCs && current.csPerMin > 4)
    list.push({ tone: 'good', text: `Melhor farm das suas últimas ${samples.length} partidas: ${round(current.csPerMin, 1)} CS/min.`, metric: 'csPerMin' });
  if (me.damageShare >= 0.3)
    list.push({ tone: 'good', text: `Você carregou ${Math.round(me.damageShare * 100)}% do dano do seu time.`, metric: 'damagePerMin' });
  return list;
}

/** Transforma as métricas em frases, equilibrado: positivo primeiro, depois o passo seguinte. */
function fillInsights(report: CoachReport, me: PostGamePlayer, mode: ModeInfo): void {
  const priority = report.role ? ROLE_PRIORITY[report.role] : DEFAULT_PRIORITY;
  const byPriority = (a: CoachMetric, b: CoachMetric) => priority.indexOf(a.key) - priority.indexOf(b.key);
  const strength = (m: CoachMetric) => Math.abs(m.deltaPct);

  const goods = report.metrics.filter((m) => m.verdict === 'good').sort(byPriority);
  const bads = report.metrics.filter((m) => m.verdict === 'bad').sort((a, b) => byPriority(a, b) || strength(b) - strength(a));

  report.wins = goods.slice(0, 2).map((m) => ({ tone: 'good', metric: m.key, text: praise(m) }));
  report.improve = bads.slice(0, 2).map((m) => ({ tone: 'bad', metric: m.key, text: coach(m, mode) }));

  // Equilibrado: se nada se destacou como positivo, reconhece o esforço sem inventar.
  if (!report.wins.length) {
    const leastBad = [...report.metrics].sort((a, b) => b.deltaPct - a.deltaPct)[0];
    if (leastBad) report.wins = [{ tone: 'neutral', metric: leastBad.key, text: steady(leastBad) }];
  }
  // Se nada caiu, deixa claro que foi sólido — e dá uma direção leve.
  if (!report.improve.length) {
    const focus = mode.lanes ? 'visão ou farm' : 'dano ou mortes';
    report.improve = [{ tone: 'neutral', text: `Nada gritante pra corrigir aqui. Pra subir mais um degrau, escolha um único foco (${focus}) e repita na próxima.` }];
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function n1(value: number): string {
  return value.toFixed(1);
}

function k(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

/** Frase de elogio para uma métrica acima da média. */
function praise(m: CoachMetric): string {
  switch (m.key) {
    case 'csPerMin':
      return `Farm acima do seu normal: ${n1(m.value)} CS/min (média ${n1(m.average)}).`;
    case 'kda':
      return `KDA de ${n1(m.value)}, acima da sua média de ${n1(m.average)} — você se posicionou bem.`;
    case 'killParticipation':
      return `Presente nas jogadas: ${pct(m.value)} de participação (média ${pct(m.average)}).`;
    case 'damagePerMin':
      return `Dano forte: ${k(m.value)}/min contra sua média de ${k(m.average)}/min.`;
    case 'goldPerMin':
      return `Boa economia: ${k(m.value)} de ouro/min (média ${k(m.average)}/min).`;
    case 'visionPerMin':
      return `Visão acima do normal: ${n1(m.value)}/min (média ${n1(m.average)}/min).`;
    case 'deaths':
      return `Só ${Math.round(m.value)} mortes — abaixo da sua média de ${n1(m.average)}. Jogou com disciplina.`;
  }
}

/** Frase de próximo passo para uma métrica abaixo da média (honesta, não dura). */
function coach(m: CoachMetric, mode: ModeInfo): string {
  // Sem rotas (ARAM, Arena...): sem rotação, sentinela nem "presença de mapa".
  if (!mode.lanes) {
    switch (m.key) {
      case 'csPerMin':
        return `Farm abaixo do seu normal: ${n1(m.value)} CS/min (você costuma fazer ${n1(m.average)}). Entre as lutas, os últimos golpes nas ondas rendem ouro sem risco.`;
      case 'goldPerMin':
        return `Ouro/min abaixo da média (${k(m.value)} vs ${k(m.average)}). Últimos golpes nas ondas e participar das lutas mantêm os itens em dia.`;
      case 'deaths':
        return `${Math.round(m.value)} mortes, acima da sua média (${n1(m.average)}). Evite ficar no alcance do poke antes da luta começar.`;
      case 'killParticipation':
        return `Participação de ${pct(m.value)} nos abates, abaixo do seu normal (${pct(m.average)}). Chegue junto nas lutas do time.`;
      default:
        break;
    }
  }
  switch (m.key) {
    case 'csPerMin':
      return `Farm abaixo do seu normal: ${n1(m.value)} CS/min (você costuma fazer ${n1(m.average)}). Tente não largar ondas ao rotacionar.`;
    case 'kda':
      return `KDA de ${n1(m.value)}, abaixo da sua média (${n1(m.average)}). Vale rever as mortes evitáveis.`;
    case 'killParticipation':
      return `Participação de ${pct(m.value)} nos abates, abaixo do seu normal (${pct(m.average)}). Acompanhe mais as jogadas do time.`;
    case 'damagePerMin':
      return `Dano abaixo do normal (${k(m.value)}/min vs ${k(m.average)}/min). Procure janelas seguras pra entrar nas trocas.`;
    case 'goldPerMin':
      return `Ouro/min abaixo da média (${k(m.value)} vs ${k(m.average)}). Mais presença de mapa ajuda a não ficar pra trás.`;
    case 'visionPerMin':
      return `Visão abaixo do seu normal (${n1(m.value)}/min vs ${n1(m.average)}/min). Usar sentinelas nos momentos-chave muda partidas.`;
    case 'deaths':
      return `${Math.round(m.value)} mortes, acima da sua média (${n1(m.average)}). Recue quando não tiver visão do mapa.`;
  }
}

/** Frase neutra ("firme na média") quando nada passou da banda. */
function steady(m: CoachMetric): string {
  return `${m.label} em linha com a sua média — manteve o nível de sempre.`;
}

/**
 * Empacota os fatos para o servidor (timeline + narração por IA). Manda só os
 * números — as frases determinísticas ficam no app como fallback.
 */
export function toCoachRequest(
  report: CoachReport,
  game: PostGame,
  me: PostGamePlayer,
  championName: string,
  matchId: string,
  platformId: string,
  puuid: string,
): CoachNarrationRequest {
  return {
    matchId,
    platformId,
    puuid,
    report: {
      games: report.games,
      role: report.role,
      queueId: report.queueId,
      overall: report.overall,
      metrics: report.metrics,
    },
    context: {
      champion: championName,
      result: game.myTeamWon === null ? 'remake' : game.myTeamWon ? 'win' : 'loss',
      kills: me.kills,
      deaths: me.deaths,
      assists: me.assists,
      durationSeconds: game.durationSeconds,
    },
  };
}
