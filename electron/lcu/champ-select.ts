import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';

export interface TeamMember {
  cellId: number;
  /** Campeão confirmado (no seu time, também o escolhido e ainda não confirmado). */
  championId: number;
  /** Campeão que o jogador está olhando antes de escolher (0 = nenhum ou escondido). */
  hoverChampionId: number;
  assignedPosition: string;
  isMe: boolean;
  spell1Id: number;
  spell2Id: number;
  /** Riot ID sem a tag; null quando a Riot esconde (inimigos, ranqueada). */
  name: string | null;
  /** Riot ID completo ("Nick#TAG"), para o ícone de quem usa o Rift Companion; null se escondido. */
  riotId: string | null;
  /** Vez dele agora: escolhendo ou banindo. */
  acting: 'pick' | 'ban' | null;
  /** Já confirmou o campeão. */
  locked: boolean;
}

export type TradeState =
  | 'AVAILABLE'
  | 'BUSY'
  | 'INVALID'
  | 'RECEIVED'
  | 'SENT'
  | 'DECLINED'
  | 'CANCELLED'
  | 'ACCEPTED';

export interface Trade {
  id: number;
  cellId: number;
  state: TradeState;
}

export interface ChampSelectState {
  championId: number;
  pickIntentChampionId: number;
  assignedPosition: string;
  team: TeamMember[];
  /** Ação de escolha do jogador em andamento (ex.: escolha inicial); null se não for a vez dele. */
  pickActionId: number | null;
  /** Ação de banimento do jogador em andamento; null se não for a vez dele. */
  banActionId: number | null;
  /** Campeões que o jogador pode escolher na ação atual. */
  pickableChampionIds: number[];
  /** Banco do ARAM ("campeões disponíveis"). */
  benchEnabled: boolean;
  benchChampionIds: number[];
  allowRerolling: boolean;
  rerollsRemaining: number;
  trades: Trade[];
  /** Campeões inimigos já revelados (0 enquanto escondidos ou na escolha às cegas). */
  enemyChampionIds: number[];
  /** Time inimigo, na ordem de escolha; os campeões aparecem conforme eles confirmam. */
  enemies: TeamMember[];
  /** Campeões banidos por cada time. */
  bans: { ally: number[]; enemy: number[] };
  /** Fase do cliente: PLANNING, BAN_PICK, FINALIZATION, GAME_STARTING. */
  phase: string;
  /** Quando a fase atual acaba (relógio do PC, ms); null sem limite. */
  timerEndsAt: number | null;
  /** ARAM novo: escolhe entre alguns campeões oferecidos antes de ir ao banco. */
  subsetPicks: boolean;
  /**
   * Campeões que você pode pegar (seus e os da rotação). No ARAM, o banco e os sorteados
   * fora desta lista ficam travados no cliente. Vazio = ainda não sabemos (nada fica travado).
   */
  availableChampionIds: number[];
}

interface SessionPlayer {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  assignedPosition?: string;
  spell1Id?: number;
  spell2Id?: number;
  gameName?: string;
  tagLine?: string;
  summonerName?: string;
  nameVisibilityType?: string;
}

export interface ChampSelectSession {
  localPlayerCellId: number;
  allowSubsetChampionPicks?: boolean;
  timer?: { phase?: string; adjustedTimeLeftInPhase?: number; internalNowInEpochMs?: number; isInfinite?: boolean };
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  benchEnabled?: boolean;
  benchChampions?: Array<{ championId: number }>;
  benchChampionIds?: number[];
  allowRerolling?: boolean;
  rerollsRemaining?: number;
  trades?: Trade[];
  actions?: Array<
    Array<{
      id: number;
      actorCellId: number;
      type: string;
      isInProgress: boolean;
      completed: boolean;
      championId?: number;
      isAllyAction?: boolean;
    }>
  >;
  myTeam: SessionPlayer[];
  theirTeam?: SessionPlayer[];
}

export function toChampSelect(
  session: ChampSelectSession,
  pickableChampionIds: number[],
): ChampSelectState | null {
  const me = session.myTeam?.find((player) => player.cellId === session.localPlayerCellId);
  if (!me) return null;

  const benchChampionIds =
    session.benchChampions?.map((bench) => bench.championId) ?? session.benchChampionIds ?? [];
  const benchEnabled = session.benchEnabled ?? benchChampionIds.length > 0;

  // No ARAM com banco não há banimento, e o ARAM clássico traz uma ação de "pick"
  // só para confirmar o sorteado (sem escolha). A escolha só existe no ARAM novo,
  // que oferece alguns campeões no começo, antes de você ter um; a lista vem de quem chamou.
  const subsetMode = benchEnabled && (!!session.allowSubsetChampionPicks || !me.championId);
  const pickActionId = benchEnabled && !subsetMode ? null : findMyPickAction(session);
  const banActionId = benchEnabled ? null : findMyAction(session, 'ban');
  const actions = (session.actions ?? []).flat();
  const acting = new Map<number, 'pick' | 'ban'>();
  const hover = new Map<number, number>();
  for (const action of actions) {
    if (!action.isInProgress || action.completed) continue;
    const type = action.type?.toLowerCase();
    if (type === 'pick' || type === 'ban') acting.set(action.actorCellId, type);
    if (type === 'pick' && action.championId) hover.set(action.actorCellId, action.championId);
  }
  const lockedPick = new Set(actions.filter((a) => a.type?.toLowerCase() === 'pick' && a.completed).map((a) => a.actorCellId));
  const member = (player: SessionPlayer, ally: boolean): TeamMember => {
    const isMe = ally && player.cellId === session.localPlayerCellId;
    const hidden = player.nameVisibilityType === 'HIDDEN';
    // No ARAM o campeão vem sorteado: conta como confirmado assim que aparece.
    const locked = player.championId > 0 && (benchEnabled || lockedPick.has(player.cellId) || !ally);
    return {
      cellId: player.cellId,
      championId: player.championId ?? 0,
      hoverChampionId: player.championId ? 0 : (player.championPickIntent || hover.get(player.cellId) || 0),
      assignedPosition: player.assignedPosition ?? '',
      isMe,
      spell1Id: player.spell1Id ?? 0,
      spell2Id: player.spell2Id ?? 0,
      name: hidden ? null : (player.gameName || player.summonerName || null),
      riotId: !hidden && player.gameName && player.tagLine ? `${player.gameName}#${player.tagLine}` : null,
      acting: acting.get(player.cellId) ?? null,
      locked,
    };
  };
  const banned = (ally: boolean) => actions
    .filter((a) => a.type?.toLowerCase() === 'ban' && a.completed && (a.championId ?? 0) > 0 &&
      (a.isAllyAction ?? session.myTeam.some((p) => p.cellId === a.actorCellId)) === ally)
    .map((a) => a.championId!);
  const timer = session.timer;
  const timerEndsAt = timer && !timer.isInfinite && timer.internalNowInEpochMs && timer.adjustedTimeLeftInPhase
    ? timer.internalNowInEpochMs + timer.adjustedTimeLeftInPhase
    : null;

  return {
    championId: me.championId,
    pickIntentChampionId: me.championPickIntent ?? 0,
    assignedPosition: me.assignedPosition ?? '',
    team: session.myTeam.map((player) => member(player, true)),
    enemies: (session.theirTeam ?? []).map((player) => member(player, false)),
    bans: {
      ally: orFallback(banned(true), session.bans?.myTeamBans),
      enemy: orFallback(banned(false), session.bans?.theirTeamBans),
    },
    phase: timer?.phase ?? '',
    timerEndsAt,
    subsetPicks: subsetMode && pickActionId !== null,
    availableChampionIds: [],
    pickActionId,
    banActionId,
    pickableChampionIds: pickActionId === null ? [] : pickableChampionIds,
    benchEnabled,
    benchChampionIds: benchChampionIds.filter((id) => id > 0),
    allowRerolling: session.allowRerolling ?? false,
    rerollsRemaining: session.rerollsRemaining ?? 0,
    trades: (session.trades ?? []).map(({ id, cellId, state }) => ({ id, cellId, state })),
    enemyChampionIds: (session.theirTeam ?? []).map((p) => p.championId).filter((id) => id > 0),
  };
}

/** Banimentos pelas ações; sem elas, o resumo `bans` da sessão. */
function orFallback(fromActions: number[], summary: number[] | undefined): number[] {
  return fromActions.length ? fromActions : (summary ?? []).filter((id) => id > 0);
}

/** Campeões oferecidos no ARAM novo; a resposta vem como lista de ids ou de objetos. */
export async function getSubsetChampionIds(credentials: LcuCredentials): Promise<number[]> {
  const raw = await lcuRequest<unknown>(credentials, 'GET', '/lol-lobby-team-builder/champ-select/v1/subset-champion-list');
  const list = Array.isArray(raw) ? raw : (raw as { championIds?: unknown[] } | null)?.championIds ?? [];
  return list
    .map((entry) => (typeof entry === 'number' ? entry : Number((entry as { championId?: number })?.championId)))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Ação de escolha do jogador que está em andamento e ainda não foi concluída. */
export function findMyPickAction(session: ChampSelectSession): number | null {
  return findMyAction(session, 'pick');
}

/** Ação do jogador (escolha ou banimento) que está em andamento e ainda não foi concluída. */
export function findMyAction(session: ChampSelectSession, type: 'pick' | 'ban'): number | null {
  for (const turn of session.actions ?? []) {
    for (const action of turn) {
      if (
        action.actorCellId === session.localPlayerCellId &&
        action.type?.toLowerCase() === type &&
        action.isInProgress &&
        !action.completed
      ) {
        return action.id;
      }
    }
  }
  return null;
}

export function getPickableChampionIds(credentials: LcuCredentials): Promise<number[]> {
  return lcuRequest<number[]>(credentials, 'GET', '/lol-champ-select/v1/pickable-champion-ids');
}

/** Escolhe e confirma o campeão na ação de escolha em andamento. */
export async function pickChampion(
  credentials: LcuCredentials,
  championId: number,
): Promise<void> {
  const session = await lcuRequest<ChampSelectSession>(
    credentials,
    'GET',
    '/lol-champ-select/v1/session',
  );
  const actionId = findMyPickAction(session);
  if (actionId === null) throw new Error('Não é a sua vez de escolher.');

  await lcuRequest(credentials, 'PATCH', `/lol-champ-select/v1/session/actions/${actionId}`, {
    championId,
  });
  await lcuRequest(credentials, 'POST', `/lol-champ-select/v1/session/actions/${actionId}/complete`);
}

/** Bane o campeão na ação de banimento em andamento. */
export async function banChampion(credentials: LcuCredentials, championId: number): Promise<void> {
  const session = await lcuRequest<ChampSelectSession>(credentials, 'GET', '/lol-champ-select/v1/session');
  const actionId = findMyAction(session, 'ban');
  if (actionId === null) throw new Error('Não é a sua vez de banir.');
  await lcuRequest(credentials, 'PATCH', `/lol-champ-select/v1/session/actions/${actionId}`, { championId });
  await lcuRequest(credentials, 'POST', `/lol-champ-select/v1/session/actions/${actionId}/complete`);
}

/** Troca o campeão atual por um do banco do ARAM. */
export function swapWithBench(credentials: LcuCredentials, championId: number): Promise<unknown> {
  return lcuRequest(credentials, 'POST', `/lol-champ-select/v1/session/bench/swap/${championId}`);
}

export function rerollChampion(credentials: LcuCredentials): Promise<unknown> {
  return lcuRequest(credentials, 'POST', '/lol-champ-select/v1/session/my-selection/reroll');
}

export type TradeAction = 'request' | 'accept' | 'decline';

export function respondTrade(
  credentials: LcuCredentials,
  tradeId: number,
  action: TradeAction,
): Promise<unknown> {
  return lcuRequest(credentials, 'POST', `/lol-champ-select/v1/session/trades/${tradeId}/${action}`);
}
