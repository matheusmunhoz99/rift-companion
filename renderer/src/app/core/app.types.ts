// Espelha electron/settings.ts, electron/main.ts e electron/overlay/live-client.ts.
export type OverlayPosition = 'left' | 'center' | 'right';
export type GameWindowMode = 'fullscreen' | 'windowed' | 'borderless' | 'unknown';
export type InvisibleStatus = 'online' | 'offline' | 'mobile';
export type InvisibleStartupStatus = InvisibleStatus | 'last';

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
  autoRunes: boolean;
  minimizeToTray: boolean;
  startWithWindows: boolean;
  telegramReadyCheck: boolean;
  telegramChampion: boolean;
  telegramGameStart: boolean;
  telegramGameEnd: boolean;
}

export interface AppInfo {
  version: string;
  overlayShortcut: string;
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
  launchLeague(): Promise<'riot-client' | 'already-open' | 'started' | 'restart-required' | null>;
  onAutoAccepted(callback: (timestamp: number) => void): () => void;
  onOverlayData(callback: (data: OverlayData) => void): () => void;
  onPreferencesChanged(callback: (preferences: Preferences) => void): () => void;
  onAutoRunesApplied(callback: (result: { championId: number; pageName: string }) => void): () => void;
  gameWindowMode(): Promise<GameWindowMode>;
  updateStatus(): Promise<UpdateStatus>;
  checkUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}

declare global {
  interface Window {
    app?: AppBridge;
  }
}
