import { EventEmitter } from 'node:events';
import { platformFromClientRegion } from '../riot/routing';
import { findLcuCredentials, type LcuCredentials } from './credentials';
import { lcuRequest } from './http';
import { LcuSocket, type LcuEvent } from './socket';

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
  /** Plataforma da Riot API da conta logada (ex.: BR1). */
  platformId: string | null;
}

interface ChampSelectSession {
  localPlayerCellId: number;
  myTeam: Array<{
    cellId: number;
    championId: number;
    championPickIntent: number;
    assignedPosition: string;
  }>;
}

const POLL_INTERVAL_MS = 2_000;

/**
 * Mantém a conexão com o cliente do LoL: procura as credenciais, abre o WebSocket,
 * carrega o estado inicial e emite 'state' a cada mudança.
 */
export class LcuConnector extends EventEmitter {
  private state: LcuState = emptyState('waiting-client');
  private credentials: LcuCredentials | null = null;
  private socket = new LcuSocket();
  private pollTimer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor() {
    super();
    this.socket.on('event', (event: LcuEvent) => this.handleEvent(event));
    this.socket.on('close', () => this.handleDisconnect());
  }

  getState(): LcuState {
    return this.state;
  }

  getCredentials(): LcuCredentials | null {
    return this.credentials;
  }

  start(): void {
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.socket.close();
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.state.status === 'connected') {
        // O perfil pode não estar disponível logo após abrir o cliente (tela de login).
        if (!this.state.summoner) await this.loadSummoner();
        return;
      }
      await this.tryConnect();
    } finally {
      this.busy = false;
    }
  }

  private async tryConnect(): Promise<void> {
    const credentials = await findLcuCredentials();
    if (!credentials) {
      this.setState(emptyState('waiting-client'));
      return;
    }

    this.setState({ ...emptyState('connecting') });
    try {
      await this.socket.connect(credentials);
    } catch {
      this.setState(emptyState('waiting-client'));
      return;
    }

    this.credentials = credentials;
    this.setState({ ...this.state, status: 'connected' });
    await Promise.all([this.loadSummoner(), this.loadGameflowPhase(), this.loadPlatform()]);
    if (this.state.gameflowPhase === 'ChampSelect') await this.loadChampSelect();
  }

  private handleDisconnect(): void {
    this.credentials = null;
    this.setState(emptyState('waiting-client'));
  }

  private handleEvent(event: LcuEvent): void {
    switch (event.uri) {
      case '/lol-gameflow/v1/gameflow-phase':
        this.setState({
          ...this.state,
          gameflowPhase: event.eventType === 'Delete' ? null : (event.data as string),
          champSelect: event.data === 'ChampSelect' ? this.state.champSelect : null,
        });
        break;
      case '/lol-champ-select/v1/session':
        this.setState({
          ...this.state,
          champSelect:
            event.eventType === 'Delete' ? null : toChampSelect(event.data as ChampSelectSession),
        });
        break;
      case '/lol-summoner/v1/current-summoner':
        if (event.eventType !== 'Delete') {
          this.setState({ ...this.state, summoner: toSummoner(event.data as Summoner) });
        }
        break;
    }
  }

  private async loadSummoner(): Promise<void> {
    const summoner = await this.get<Summoner>('/lol-summoner/v1/current-summoner');
    if (summoner) this.setState({ ...this.state, summoner: toSummoner(summoner) });
  }

  private async loadGameflowPhase(): Promise<void> {
    const phase = await this.get<string>('/lol-gameflow/v1/gameflow-phase');
    this.setState({ ...this.state, gameflowPhase: phase });
  }

  private async loadPlatform(): Promise<void> {
    const locale = await this.get<{ region: string }>('/riotclient/region-locale');
    const platformId = locale ? platformFromClientRegion(locale.region) : null;
    this.setState({ ...this.state, platformId });
  }

  private async loadChampSelect(): Promise<void> {
    const session = await this.get<ChampSelectSession>('/lol-champ-select/v1/session');
    this.setState({ ...this.state, champSelect: session ? toChampSelect(session) : null });
  }

  private async get<T>(endpoint: string): Promise<T | null> {
    if (!this.credentials) return null;
    try {
      return await lcuRequest<T>(this.credentials, 'GET', endpoint);
    } catch {
      return null;
    }
  }

  private setState(next: LcuState): void {
    this.state = next;
    this.emit('state', next);
  }
}

function emptyState(status: ConnectionStatus): LcuState {
  return { status, summoner: null, gameflowPhase: null, champSelect: null, platformId: null };
}

function toSummoner(data: Summoner): Summoner {
  return {
    puuid: data.puuid,
    summonerId: data.summonerId,
    gameName: data.gameName,
    tagLine: data.tagLine,
    summonerLevel: data.summonerLevel,
    profileIconId: data.profileIconId,
  };
}

function toChampSelect(session: ChampSelectSession): ChampSelectState | null {
  const me = session.myTeam?.find((player) => player.cellId === session.localPlayerCellId);
  if (!me) return null;
  return {
    championId: me.championId,
    pickIntentChampionId: me.championPickIntent,
    assignedPosition: me.assignedPosition,
  };
}
