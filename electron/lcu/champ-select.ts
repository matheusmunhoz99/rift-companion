import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';

export interface TeamMember {
  cellId: number;
  championId: number;
  assignedPosition: string;
  isMe: boolean;
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
}

export interface ChampSelectSession {
  localPlayerCellId: number;
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
    }>
  >;
  myTeam: Array<{
    cellId: number;
    championId: number;
    championPickIntent: number;
    assignedPosition: string;
  }>;
  theirTeam?: Array<{ cellId: number; championId: number }>;
}

export function toChampSelect(
  session: ChampSelectSession,
  pickableChampionIds: number[],
): ChampSelectState | null {
  const me = session.myTeam?.find((player) => player.cellId === session.localPlayerCellId);
  if (!me) return null;

  const pickActionId = findMyPickAction(session);
  const benchChampionIds =
    session.benchChampions?.map((bench) => bench.championId) ?? session.benchChampionIds ?? [];

  return {
    championId: me.championId,
    pickIntentChampionId: me.championPickIntent,
    assignedPosition: me.assignedPosition,
    team: session.myTeam.map((player) => ({
      cellId: player.cellId,
      championId: player.championId,
      assignedPosition: player.assignedPosition,
      isMe: player.cellId === session.localPlayerCellId,
    })),
    pickActionId,
    banActionId: findMyAction(session, 'ban'),
    pickableChampionIds: pickActionId === null ? [] : pickableChampionIds,
    benchEnabled: session.benchEnabled ?? benchChampionIds.length > 0,
    benchChampionIds: benchChampionIds.filter((id) => id > 0),
    allowRerolling: session.allowRerolling ?? false,
    rerollsRemaining: session.rerollsRemaining ?? 0,
    trades: (session.trades ?? []).map(({ id, cellId, state }) => ({ id, cellId, state })),
    enemyChampionIds: (session.theirTeam ?? []).map((p) => p.championId).filter((id) => id > 0),
  };
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
        action.type === type &&
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
