// Espelha electron/settings.ts, electron/main.ts e electron/overlay/live-client.ts.
export type OverlayPosition = 'left' | 'center' | 'right';
export type GameWindowMode = 'fullscreen' | 'windowed' | 'borderless' | 'unknown';
export type InvisibleStatus = 'online' | 'offline' | 'mobile';
export type InvisibleStartupStatus = InvisibleStatus | 'last';
export type RankedQueue = 'solo' | 'flex';

/** Espelha electron/lcu/rank-tracker.ts. */
export interface RankEntry {
  at: number;
  queue: RankedQueue;
  tier: string;
  division: string;
  lp: number;
  lpChange: number;
  win: boolean | null;
  championId: number;
  note: 'promo' | 'demote' | null;
}

export interface Preferences {
  autoAccept: boolean;
  appearOffline: boolean;
  invisibleStatus: InvisibleStatus;
  invisibleStartupStatus: InvisibleStartupStatus;
  invisibleLobbyChat: boolean;
  overlayEnabled: boolean;
  overlayPosition: OverlayPosition;
  overlayOpacity: number;
  autoNavigate: boolean;
  matchMode: boolean;
  matchModeWindow: boolean;
  matchModeFullscreen: boolean;
  focusOnChampSelect: boolean;
  autoRunes: boolean;
  minimizeToTray: boolean;
  startWithWindows: boolean;
  showAsRiftUser: boolean;
  chatObjectiveAlerts: boolean;
  voiceAlerts: boolean;
  voiceVolume: number;
  appShortcut: boolean;
  liveRead: boolean;
  liveReadVoice: boolean;
  sendErrorReports: boolean;
  detailedDiagnostics: boolean;
  telegramReadyCheck: boolean;
  telegramChampion: boolean;
  telegramGameStart: boolean;
  telegramGameEnd: boolean;
}

export interface AppInfo {
  version: string;
  overlayShortcut: string;
  /** Mostra e esconde o app de qualquer lugar ("Ctrl+Shift+R"). Ausente em versões antigas. */
  appShortcut?: string;
  buildsDirectory: string;
}

export interface OverlayPlayer {
  championName: string;
  championKey: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  items: Array<{ id: number; count: number }>;
}

export interface OverlayData {
  gameTime: number;
  gameMode: string;
  me: (OverlayPlayer & {
    position: string;
    csPerMinute: number;
    gold: number;
    wardScore: number;
    skills: [number, number, number, number] | null;
  }) | null;
  opponent: OverlayPlayer | null;
  teamKills: { ally: number; enemy: number };
  objectives: {
    dragons: { ally: number; enemy: number };
    barons: { ally: number; enemy: number };
    heralds: { ally: number; enemy: number };
    towers: { ally: number; enemy: number };
  };
  upcoming: Array<{ key: 'dragon' | 'grubs' | 'herald' | 'atakhan' | 'baron'; name: string; state: 'upcoming' | 'alive'; at: number }>;
  /** Inibidores derrubados que vão voltar (`ally` = do seu time). */
  inhibitors?: Array<{ ally: boolean; lane: string; respawnAt: number }>;
  /** Campos da selva marcados como mortos no app (tempo de jogo em que voltam). */
  camps?: CampTimer[];
}

/** Um campo da selva marcado como morto: o app conta até ele voltar. */
export interface CampTimer {
  key: string;
  /** "Azul", "Vermelho inimigo", "Caranguejo de cima"... */
  name: string;
  backAt: number;
}

/** Imagem gerada a partir de um pedaço da tela (card de compartilhar). */
export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReleaseInfo {
  version: string;
  file: string;
  sha256: string;
  size: number;
  notes: string[];
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'available'; release: ReleaseInfo }
  | { state: 'downloading'; release: ReleaseInfo; progress: number }
  | { state: 'error'; message: string };

export interface AppBridge {
  info(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  setPreferences(changes: Partial<Preferences>): Promise<Preferences>;
  openBuildsFolder(): Promise<void>;
  /** Envia um erro ao servidor (anônimo), respeitando a preferência da pessoa. */
  report(context: string, message: string, stack?: string): Promise<void>;
  /** Diagnóstico detalhado (só tem efeito com a opção ligada). Ausente no celular. */
  diagEvent?(kind: string, fields?: unknown): Promise<void>;
  /** Histórico de PDL das partidas ranqueadas (registrado localmente). */
  rankHistory(): Promise<RankEntry[]>;
  onRankUpdated(callback: () => void): () => void;
  launchLeague(): Promise<
    'riot-client' | 'already-open' | 'started' | 'restart-required' | 'restarted' | 'waiting' | 'declined' | null
  >;
  onAutoAccepted(callback: (timestamp: number) => void): () => void;
  onOverlayData(callback: (data: OverlayData) => void): () => void;
  onPreferencesChanged(callback: (preferences: Preferences) => void): () => void;
  onAutoRunesApplied(callback: (result: { championId: number; pageName: string }) => void): () => void;
  gameWindowMode(): Promise<GameWindowMode>;
  /** Modo partida: aumenta a janela (true) ou volta ao tamanho de antes (false). App antigo não tem. */
  /** true = janela aumentada; 'fullscreen' = tela cheia (carregamento e jogo); false = tamanho de antes. */
  setMatchWindow?(mode: boolean | 'fullscreen'): Promise<void>;
  updateStatus(): Promise<UpdateStatus>;
  checkUpdate(): Promise<UpdateStatus>;
  /** false = adiada pelo usuário na confirmação (durante a seleção ou a partida). */
  installUpdate(): Promise<boolean | void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  /** A janela entrou ou saiu da tela cheia (modo partida). Só no PC. */
  onFullscreenChanged?(callback: (fullscreen: boolean) => void): () => void;
  /** Frase para falar em voz alta (avisos de objetivos da partida). Só no PC. */
  onSpeak?(callback: (text: string) => void): () => void;
  /** Campos da selva marcados, para o overlay mostrar a contagem por cima do jogo. Só no PC. */
  setCampTimers?(camps: CampTimer[]): void;
  /** Copia (ou salva) como imagem um pedaço da janela. false = cancelado. Só no PC. */
  captureImage?(rect: CaptureRect, action: 'copy' | 'save', fileName: string): Promise<boolean>;
}

declare global {
  interface Window {
    app?: AppBridge;
  }
}
