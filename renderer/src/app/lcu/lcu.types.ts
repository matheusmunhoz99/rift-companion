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
}

export interface LcuBridge {
  getState(): Promise<LcuState>;
  onState(callback: (state: LcuState) => void): () => void;
}

declare global {
  interface Window {
    lcu?: LcuBridge;
    champSelect?: ChampSelectBridge;
  }
}
