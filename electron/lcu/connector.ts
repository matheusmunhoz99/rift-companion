import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { platformFromClientRegion } from '../riot/routing';
import {
  findMyPickAction,
  getPickableChampionIds,
  toChampSelect,
  type ChampSelectSession,
  type ChampSelectState,
} from './champ-select';
import { findLcuCredentials, type LcuCredentials } from './credentials';
import {
  toLobbyState,
  toSearchState,
  withSearchTimes,
  type LobbyState,
  type RawLobby,
  type ReadyCheckState,
  type SearchState,
} from './lobby';
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

export type { ChampSelectState };

export interface LcuState {
  status: ConnectionStatus;
  summoner: Summoner | null;
  gameflowPhase: string | null;
  champSelect: ChampSelectState | null;
  /** Plataforma da Riot API da conta logada (ex.: BR1). */
  platformId: string | null;
  lobby: LobbyState | null;
  search: SearchState | null;
  readyCheck: ReadyCheckState | null;
}

const POLL_INTERVAL_MS = 2_000;
const SNAPSHOT_INTERVAL_MS = 5_000;

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
  /** Campeões escolhíveis, buscados uma vez por ação de escolha. */
  private pickable: { actionId: number; championIds: number[] } | null = null;
  private snapshotDirectory: string | null = null;
  private readonly names = new Map<string, { gameName: string; tagLine: string }>();
  private lastSnapshotAt = 0;

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

  /**
   * Grava a sessão de seleção bruta (local, a cada 5 s no máximo) para
   * conferir campos de modos novos, como os do ARAM.
   */
  setSnapshotDirectory(directory: string): void {
    this.snapshotDirectory = directory;
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
    await Promise.all([this.loadSummoner(), this.loadGameflowPhase(), this.loadPlatform(), this.loadLobby()]);
    if (this.state.gameflowPhase === 'ChampSelect') await this.loadChampSelect();
  }

  private handleDisconnect(): void {
    this.credentials = null;
    this.setState(emptyState('waiting-client'));
  }

  private handleEvent(event: LcuEvent): void {
    // Repassa os eventos brutos para recursos como o aceite automático.
    this.emit('lcu-event', event);

    switch (event.uri) {
      case '/lol-gameflow/v1/gameflow-phase':
        this.setState({
          ...this.state,
          gameflowPhase: event.eventType === 'Delete' ? null : (event.data as string),
          champSelect: event.data === 'ChampSelect' ? this.state.champSelect : null,
        });
        break;
      case '/lol-champ-select/v1/session':
        if (event.eventType === 'Delete') {
          this.pickable = null;
          this.setState({ ...this.state, champSelect: null });
        } else {
          void this.applySession(event.data as ChampSelectSession);
        }
        break;
      case '/lol-lobby/v2/lobby':
        if (event.eventType === 'Delete' || !event.data) {
          this.setState({ ...this.state, lobby: null });
        } else {
          void this.applyLobby(toLobbyState(event.data as RawLobby));
        }
        break;
      case '/lol-lobby/v2/lobby/matchmaking/search-state':
        this.setState({
          ...this.state,
          search:
            event.eventType === 'Delete' || !event.data
              ? null
              : toSearchState(event.data as Parameters<typeof toSearchState>[0], this.state.search),
        });
        break;
      case '/lol-matchmaking/v1/search':
        if (event.eventType !== 'Delete' && event.data) {
          this.setState({
            ...this.state,
            search: withSearchTimes(this.state.search, event.data as Parameters<typeof withSearchTimes>[1]),
          });
        }
        break;
      case '/lol-matchmaking/v1/ready-check': {
        const data = event.data as ReadyCheckState | null;
        this.setState({
          ...this.state,
          readyCheck:
            event.eventType === 'Delete' || !data || data.state !== 'InProgress'
              ? null
              : { state: data.state, playerResponse: data.playerResponse, timer: data.timer },
        });
        break;
      }
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

  private async loadLobby(): Promise<void> {
    const lobby = await this.get<RawLobby>('/lol-lobby/v2/lobby');
    if (lobby) await this.applyLobby(toLobbyState(lobby));
    else this.setState({ ...this.state, lobby: null });
  }

  /**
   * O cliente não envia mais o nome dos membros da sala; o Riot ID vem do
   * endpoint de invocador pelo puuid, com cache durante a sessão.
   */
  private async applyLobby(lobby: LobbyState): Promise<void> {
    this.setState({ ...this.state, lobby: this.withNames(lobby) });
    const missing = lobby.members.filter((m) => !m.gameName && m.puuid && !this.names.has(m.puuid));
    if (missing.length === 0) return;

    await Promise.all(
      missing.map(async (member) => {
        const summoner = await this.get<{ gameName: string; tagLine: string }>(
          `/lol-summoner/v2/summoners/puuid/${member.puuid}`,
        );
        if (summoner?.gameName) this.names.set(member.puuid, { gameName: summoner.gameName, tagLine: summoner.tagLine });
      }),
    );
    if (this.state.lobby) this.setState({ ...this.state, lobby: this.withNames(this.state.lobby) });
  }

  private withNames(lobby: LobbyState): LobbyState {
    return {
      ...lobby,
      members: lobby.members.map((member) => {
        const name = member.gameName ? null : this.names.get(member.puuid);
        return name ? { ...member, ...name } : member;
      }),
    };
  }

  private async loadPlatform(): Promise<void> {
    const locale = await this.get<{ region: string }>('/riotclient/region-locale');
    const platformId = locale ? platformFromClientRegion(locale.region) : null;
    this.setState({ ...this.state, platformId });
  }

  private async loadChampSelect(): Promise<void> {
    const session = await this.get<ChampSelectSession>('/lol-champ-select/v1/session');
    if (session) await this.applySession(session);
    else this.setState({ ...this.state, champSelect: null });
  }

  private async applySession(session: ChampSelectSession): Promise<void> {
    void this.saveSnapshot(session);

    // Mostra a sessão na hora; os campeões escolhíveis chegam em seguida.
    // No ARAM (modo com banco) não há grade de escolha, então nem busca a lista.
    const benchMode =
      session.benchEnabled ?? (session.benchChampions?.length ?? session.benchChampionIds?.length ?? 0) > 0;
    const actionId = benchMode ? null : findMyPickAction(session);
    const known = actionId !== null && this.pickable?.actionId === actionId;
    this.setState({
      ...this.state,
      champSelect: toChampSelect(session, known ? this.pickable!.championIds : []),
    });
    if (actionId === null || known || !this.credentials) return;

    try {
      const championIds = await getPickableChampionIds(this.credentials);
      this.pickable = { actionId, championIds };
      const current = this.state.champSelect;
      if (current && current.pickActionId === actionId) {
        this.setState({ ...this.state, champSelect: { ...current, pickableChampionIds: championIds } });
      }
    } catch {
      // Sem a lista, a tela só não oferece a escolha pelo app.
    }
  }

  private async saveSnapshot(session: ChampSelectSession): Promise<void> {
    if (!this.snapshotDirectory || Date.now() - this.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
    this.lastSnapshotAt = Date.now();
    try {
      // chatDetails traz o token (JWT) do chat da seleção; não é necessário para diagnóstico.
      const { chatDetails: _chat, ...safeSession } = session as ChampSelectSession & {
        chatDetails?: unknown;
      };
      await mkdir(this.snapshotDirectory, { recursive: true });
      await writeFile(
        path.join(this.snapshotDirectory, 'champ-select-session.json'),
        JSON.stringify(safeSession, null, 2),
      );
    } catch {
      // Diagnóstico apenas; falhas não afetam o app.
    }
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
  return {
    status,
    summoner: null,
    gameflowPhase: null,
    champSelect: null,
    platformId: null,
    lobby: null,
    search: null,
    readyCheck: null,
  };
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

