// Espelha os tipos de electron/lcu/connector.ts.
export type ConnectionStatus = 'waiting-client' | 'connecting' | 'connected';

export interface Summoner {
  puuid: string;
  summonerId: number;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
}

// Espelha electron/lcu/champ-select.ts.
export interface TeamMember {
  cellId: number;
  championId: number;
  assignedPosition: string;
  isMe: boolean;
}

export interface Trade {
  id: number;
  cellId: number;
  state: 'AVAILABLE' | 'BUSY' | 'INVALID' | 'RECEIVED' | 'SENT' | 'DECLINED' | 'CANCELLED' | 'ACCEPTED';
}

export interface ChampSelectState {
  championId: number;
  pickIntentChampionId: number;
  assignedPosition: string;
  team: TeamMember[];
  pickActionId: number | null;
  pickableChampionIds: number[];
  benchEnabled: boolean;
  benchChampionIds: number[];
  allowRerolling: boolean;
  rerollsRemaining: number;
  trades: Trade[];
  /** Campeões inimigos já revelados. */
  enemyChampionIds?: number[];
}

export interface ChampSelectBridge {
  pick(championId: number): Promise<void>;
  benchSwap(championId: number): Promise<void>;
  reroll(): Promise<void>;
  trade(tradeId: number, action: 'request' | 'accept' | 'decline'): Promise<void>;
}

export interface LcuState {
  status: ConnectionStatus;
  summoner: Summoner | null;
  gameflowPhase: string | null;
  champSelect: ChampSelectState | null;
  platformId: string | null;
  lobby: LobbyState | null;
  search: SearchState | null;
  readyCheck: ReadyCheckState | null;
}

// Espelha electron/lcu/lobby.ts.
export type Position = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'FILL' | 'UNSELECTED';

export interface QueueOption {
  id: number;
  name: string;
  gameMode: string;
  mapId: number;
  category: string;
  group: string;
  isRanked: boolean;
  showPositionSelector: boolean;
  showQuickPlaySlotSelection: boolean;
}

export interface PlayerSlot {
  championId: number;
  positionPreference: string;
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
  localPlayerSlots: PlayerSlot[];
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
  gameStatus: string;
}

export interface LobbyBridge {
  queues(): Promise<QueueOption[]>;
  friends(): Promise<Friend[]>;
  create(queueId: number): Promise<void>;
  leave(): Promise<void>;
  setPositions(first: Position, second: Position): Promise<void>;
  search(start: boolean): Promise<void>;
  invite(summonerId: number): Promise<void>;
  readyCheck(accept: boolean): Promise<void>;
  champions(): Promise<number[]>;
  setSlot(index: number, championId: number, position: string): Promise<void>;
}

export interface LcuBridge {
  getState(): Promise<LcuState>;
  onState(callback: (state: LcuState) => void): () => void;
}

declare global {
  interface Window {
    lcu?: LcuBridge;
    champSelect?: ChampSelectBridge;
    lobby?: LobbyBridge;
  }
}
