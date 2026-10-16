// Espelha electron/settings.ts, electron/main.ts e electron/overlay/live-client.ts.
export type OverlayPosition = 'left' | 'center' | 'right';
export type GameWindowMode = 'fullscreen' | 'windowed' | 'borderless' | 'unknown';

export interface Preferences {
  autoAccept: boolean;
  overlayEnabled: boolean;
  overlayPosition: OverlayPosition;
  overlayOpacity: number;
  autoNavigate: boolean;
  autoRunes: boolean;
  minimizeToTray: boolean;
  startWithWindows: boolean;
}

export interface AppInfo {
  version: string;
  overlayShortcut: string;
  buildsDirectory: string;
}

export interface OverlayData {
  gameTime: number;
  gameMode: string;
  me: {
    championName: string;
    level: number;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    csPerMinute: number;
    gold: number;
    wardScore: number;
  } | null;
  teamKills: { ally: number; enemy: number };
  objectives: {
    dragons: { ally: number; enemy: number };
    barons: { ally: number; enemy: number };
    heralds: { ally: number; enemy: number };
    towers: { ally: number; enemy: number };
  };
}

export interface AppBridge {
  info(): Promise<AppInfo>;
  getPreferences(): Promise<Preferences>;
  setPreferences(changes: Partial<Preferences>): Promise<Preferences>;
  openBuildsFolder(): Promise<void>;
  onAutoAccepted(callback: (timestamp: number) => void): () => void;
  onOverlayData(callback: (data: OverlayData) => void): () => void;
  onPreferencesChanged(callback: (preferences: Preferences) => void): () => void;
  onAutoRunesApplied(callback: (result: { championId: number; pageName: string }) => void): () => void;
  gameWindowMode(): Promise<GameWindowMode>;
}

declare global {
  interface Window {
    app?: AppBridge;
  }
}
