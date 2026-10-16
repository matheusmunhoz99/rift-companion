import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';
import { getRecommendedRunePages } from './perks';

export type Position = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'FILL' | 'UNSELECTED';
const POSITIONS: Position[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL', 'UNSELECTED'];

export interface QueueOption {
  id: number;
  name: string;
  gameMode: string;
  mapId: number;
  category: string;
  group: string;
  isRanked: boolean;
  showPositionSelector: boolean;
  /** Jogo Dinâmico: cada jogador escolhe 2 campeões, cada um com uma rota. */
  showQuickPlaySlotSelection: boolean;
}

export interface PlayerSlot {
  championId: number;
  positionPreference: string;
  /** JSON com perkIds, perkStyle e perkSubStyle, no formato do cliente. */
  perks: string;
  skinId: number;
  spell1: number;
  spell2: number;
}

export interface LobbyMember {
  puuid: string;
  summonerId: number;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  summonerIconId: number;
  isLeader: boolean;
  isBot: boolean;
  firstPosition: Position;
  secondPosition: Position;
  playerSlots: PlayerSlot[];
}

export interface LobbyState {
  queueId: number;
  showPositionSelector: boolean;
  maxLobbySize: number;
  canStartActivity: boolean;
  isLeader: boolean;
  /** Slots de campeão do jogador local (Jogo Dinâmico); vazio nas outras filas. */
  localPlayerSlots: PlayerSlot[];
  /** Rotas prioritárias da fila agora (o cliente exige uma delas entre os slots). */
  scarcePositions: string[];
  members: LobbyMember[];
  invitations: Array<{ toSummonerId: number; toSummonerName: string; state: string }>;
}

export interface SearchState {
  searchState: string;
  timeInQueue: number;
  estimatedQueueTime: number;
  errors: string[];
}

export interface ReadyCheckState {
  state: string;
  playerResponse: string;
  timer: number;
}

export interface Friend {
  puuid: string;
  summonerId: number;
  gameName: string;
  tagLine: string;
  icon: number;
  availability: string;
  /** Status do LoL (ex.: outOfGame, inGame, championSelect, hosting_*). */
  gameStatus: string;
}

interface RawQueue {
  id: number;
  name: string;
  description: string;
  shortName: string;
  gameMode: string;
  mapId: number;
  category: string;
  gameSelectModeGroup: string;
  isRanked: boolean;
  isCustom: boolean;
  isVisible: boolean;
  queueAvailability: string;
  showPositionSelector: boolean;
  showQuickPlaySlotSelection?: boolean;
  type: string;
}

interface RawMember {
  puuid: string;
  summonerId: number;
  gameName?: string;
  tagLine?: string;
  summonerName?: string;
  summonerLevel: number;
  summonerIconId: number;
  isLeader: boolean;
  isBot: boolean;
  firstPositionPreference: string;
  secondPositionPreference: string;
  playerSlots?: PlayerSlot[];
}

export interface RawLobby {
  canStartActivity: boolean;
  gameConfig: { queueId: number; showPositionSelector: boolean; maxLobbySize: number };
  members: RawMember[];
  localMember: RawMember;
  invitations?: Array<{ toSummonerId: number; toSummonerName: string; state: string }>;
  scarcePositions?: string[];
}

/** Modos que não são do LoL (TFT) ou não fazem sentido no app (tutoriais). */
const HIDDEN_MODES = /^(TFT|TUTORIAL)/;

export async function getQueues(credentials: LcuCredentials): Promise<QueueOption[]> {
  const queues = await lcuRequest<RawQueue[]>(credentials, 'GET', '/lol-game-queues/v1/queues');
  return queues
    .filter(
      (q) =>
        q.queueAvailability === 'Available' &&
        !q.isCustom &&
        !HIDDEN_MODES.test(q.gameMode) &&
        // Clash exige time inscrito no torneio; não abre como sala comum.
        !q.type.includes('CLASH') &&
        (q.description || q.name),
    )
    .map((q) => ({
      id: q.id,
      name: q.description || q.name,
      gameMode: q.gameMode,
      mapId: q.mapId,
      category: q.category,
      group: q.gameSelectModeGroup,
      isRanked: q.isRanked,
      showPositionSelector: q.showPositionSelector,
      showQuickPlaySlotSelection: q.showQuickPlaySlotSelection ?? false,
    }))
    // Algumas filas aparecem repetidas com o mesmo nome.
    .filter((queue, index, list) => list.findIndex((q) => q.name === queue.name) === index);
}

export function toLobbyState(raw: RawLobby): LobbyState {
  return {
    queueId: raw.gameConfig.queueId,
    showPositionSelector: raw.gameConfig.showPositionSelector,
    maxLobbySize: raw.gameConfig.maxLobbySize,
    canStartActivity: raw.canStartActivity,
    isLeader: raw.localMember?.isLeader ?? false,
    localPlayerSlots: (raw.localMember?.playerSlots ?? []).map(toSlot),
    scarcePositions: raw.scarcePositions ?? [],
    members: raw.members.map((m) => ({
      puuid: m.puuid,
      summonerId: m.summonerId,
      gameName: m.gameName || m.summonerName || '',
      tagLine: m.tagLine ?? '',
      summonerLevel: m.summonerLevel,
      summonerIconId: m.summonerIconId,
      isLeader: m.isLeader,
      isBot: m.isBot,
      firstPosition: toPosition(m.firstPositionPreference),
      secondPosition: toPosition(m.secondPositionPreference),
      playerSlots: (m.playerSlots ?? []).map(toSlot),
    })),
    invitations: (raw.invitations ?? []).map(({ toSummonerId, toSummonerName, state }) => ({
      toSummonerId,
      toSummonerName,
      state,
    })),
  };
}

/** Tempo na fila e estimativa (só existe enquanto a busca está ativa). */
export function withSearchTimes(
  current: SearchState | null,
  raw: { searchState?: string; timeInQueue?: number; estimatedQueueTime?: number },
): SearchState {
  return {
    searchState: raw.searchState ?? current?.searchState ?? 'Searching',
    timeInQueue: raw.timeInQueue ?? 0,
    estimatedQueueTime: raw.estimatedQueueTime ?? 0,
    errors: current?.errors ?? [],
  };
}

export function toSearchState(raw: {
  searchState: string;
  timeInQueue?: number;
  estimatedQueueTime?: number;
  errors?: Array<{ message?: string; errorType?: string }>;
}, current: SearchState | null = null): SearchState {
  // search-state só traz estado e erros; os tempos vêm de /lol-matchmaking/v1/search.
  const active = raw.searchState === 'Searching';
  return {
    searchState: raw.searchState,
    timeInQueue: raw.timeInQueue ?? (active ? (current?.timeInQueue ?? 0) : 0),
    estimatedQueueTime: raw.estimatedQueueTime ?? (active ? (current?.estimatedQueueTime ?? 0) : 0),
    errors: (raw.errors ?? []).map((e) => e.message || e.errorType || 'Erro na fila'),
  };
}

export function createLobby(credentials: LcuCredentials, queueId: number): Promise<unknown> {
  return lcuRequest(credentials, 'POST', '/lol-lobby/v2/lobby', { queueId });
}

export function leaveLobby(credentials: LcuCredentials): Promise<unknown> {
  return lcuRequest(credentials, 'DELETE', '/lol-lobby/v2/lobby');
}

export function setPositions(
  credentials: LcuCredentials,
  first: Position,
  second: Position,
): Promise<unknown> {
  if (!POSITIONS.includes(first) || !POSITIONS.includes(second)) {
    throw new Error('Rota inválida.');
  }
  return lcuRequest(
    credentials,
    'PUT',
    '/lol-lobby/v2/lobby/members/localMember/position-preferences',
    { firstPreference: first, secondPreference: second },
  );
}

export function startSearch(credentials: LcuCredentials): Promise<unknown> {
  return lcuRequest(credentials, 'POST', '/lol-lobby/v2/lobby/matchmaking/search');
}

export function cancelSearch(credentials: LcuCredentials): Promise<unknown> {
  return lcuRequest(credentials, 'DELETE', '/lol-lobby/v2/lobby/matchmaking/search');
}

export function inviteFriend(credentials: LcuCredentials, summonerId: number): Promise<unknown> {
  return lcuRequest(credentials, 'POST', '/lol-lobby/v2/lobby/invitations', [{ toSummonerId: summonerId }]);
}

export function respondReadyCheck(credentials: LcuCredentials, accept: boolean): Promise<unknown> {
  return lcuRequest(
    credentials,
    'POST',
    `/lol-matchmaking/v1/ready-check/${accept ? 'accept' : 'decline'}`,
  );
}

export async function getFriends(credentials: LcuCredentials): Promise<Friend[]> {
  const friends = await lcuRequest<
    Array<{
      puuid: string;
      summonerId: number;
      gameName: string;
      gameTag: string;
      icon: number;
      availability: string;
      product: string;
      lol?: { gameStatus?: string };
    }>
  >(credentials, 'GET', '/lol-chat/v1/friends');

  const order: Record<string, number> = { chat: 0, away: 1, dnd: 2, mobile: 3, offline: 4 };
  return friends
    .map((f) => ({
      puuid: f.puuid,
      summonerId: f.summonerId,
      gameName: f.gameName,
      tagLine: f.gameTag,
      icon: f.icon,
      availability: f.availability,
      gameStatus: f.product === 'league_of_legends' ? (f.lol?.gameStatus ?? '') : '',
    }))
    .sort(
      (a, b) =>
        (order[a.availability] ?? 5) - (order[b.availability] ?? 5) ||
        a.gameName.localeCompare(b.gameName, 'pt-BR'),
    );
}

function toSlot(slot: PlayerSlot): PlayerSlot {
  return {
    championId: slot.championId,
    positionPreference: slot.positionPreference,
    perks: slot.perks,
    skinId: slot.skinId,
    spell1: slot.spell1,
    spell2: slot.spell2,
  };
}

const SLOT_POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const SUMMONERS_RIFT = 11;

/**
 * Troca o campeão e/ou a rota de um slot do Jogo Dinâmico. Campeão novo recebe
 * as runas e os feitiços que o cliente recomenda para ele nessa rota.
 */
export async function setPlayerSlot(
  credentials: LcuCredentials,
  index: number,
  championId: number,
  position: string,
): Promise<void> {
  if (index !== 0 && index !== 1) throw new Error('Slot inválido.');
  if (!SLOT_POSITIONS.includes(position)) throw new Error('Rota inválida.');

  const lobby = await lcuRequest<RawLobby>(credentials, 'GET', '/lol-lobby/v2/lobby');
  const slots = (lobby.localMember?.playerSlots ?? []).map(toSlot);
  const other = slots[1 - index];
  if (other && other.championId === championId) throw new Error('Escolha campeões diferentes nos dois slots.');
  if (other && other.positionPreference === position) throw new Error('Escolha rotas diferentes nos dois slots.');
  const scarce = lobby.scarcePositions ?? [];
  if (other && scarce.length > 0 && !scarce.includes(position) && !scarce.includes(other.positionPreference)) {
    throw new Error(`Uma das rotas precisa ser prioritária: ${scarce.map(positionName).join(' ou ')}.`);
  }

  const current = slots[index];
  let slot: PlayerSlot;
  if (current && current.championId === championId) {
    slot = { ...current, positionPreference: position };
  } else {
    const [page] = await getRecommendedRunePages(credentials, championId, position.toLowerCase(), SUMMONERS_RIFT).catch(() => []);
    slot = {
      championId,
      positionPreference: position,
      perks: JSON.stringify(
        page
          ? { perkIds: page.perks.map((perk) => perk.id), perkStyle: page.primaryStyleId, perkSubStyle: page.secondaryStyleId }
          : { perkIds: [], perkStyle: 0, perkSubStyle: 0 },
      ),
      skinId: championId * 1000,
      spell1: page?.summonerSpellIds[0] ?? 4,
      spell2: page?.summonerSpellIds[1] ?? 14,
    };
  }

  const next = [...slots];
  next[index] = slot;
  await lcuRequest(credentials, 'PUT', '/lol-lobby/v1/lobby/members/localMember/player-slots', next);
}

const POSITION_NAMES: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
};

function positionName(position: string): string {
  return POSITION_NAMES[position] ?? position;
}

/** Campeões que o jogador pode usar: comprados ou na rotação gratuita. */
export async function getAvailableChampions(credentials: LcuCredentials): Promise<number[]> {
  const champions = await lcuRequest<
    Array<{ id: number; active: boolean; freeToPlay: boolean; ownership?: { owned?: boolean } }>
  >(credentials, 'GET', '/lol-champions/v1/owned-champions-minimal');
  return champions.filter((c) => c.active && (c.ownership?.owned || c.freeToPlay)).map((c) => c.id);
}

function toPosition(value: string): Position {
  return POSITIONS.includes(value as Position) ? (value as Position) : 'UNSELECTED';
}
