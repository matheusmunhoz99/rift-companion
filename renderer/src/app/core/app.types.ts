// Espelha electron/settings.ts, electron/main.ts e electron/overlay/live-client.ts.
export interface Preferences {
  autoAccept: boolean;
  overlayEnabled: boolean;
  autoNavigate: boolean;
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
}

declare global {
  interface Window {
    app?: AppBridge;
  }
}
