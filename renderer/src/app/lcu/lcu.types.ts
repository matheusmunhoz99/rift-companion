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

export interface ChampSelectState {
  championId: number;
  pickIntentChampionId: number;
  assignedPosition: string;
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

export interface AutoAcceptBridge {
  get(): Promise<boolean>;
  set(enabled: boolean): Promise<void>;
  onAccepted(callback: (timestamp: number) => void): () => void;
}

declare global {
  interface Window {
    lcu?: LcuBridge;
    autoAccept?: AutoAcceptBridge;
  }
}
