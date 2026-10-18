import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type OverlayPosition = 'left' | 'center' | 'right';

export interface Preferences {
  autoAccept: boolean;
  overlayEnabled: boolean;
  overlayPosition: OverlayPosition;
  /** Opacidade do overlay, de 0.4 a 1. */
  overlayOpacity: number;
  /** Abre a tela certa sozinho (seleção, partida) conforme a fase do cliente. */
  autoNavigate: boolean;
  /** Importa runas e feitiços recomendados ao travar o campeão. */
  autoRunes: boolean;
  /** Fechar a janela mantém o app na bandeja (aceite automático continua funcionando). */
  minimizeToTray: boolean;
  startWithWindows: boolean;
  /** Avisos no Telegram (só valem com o Telegram conectado). */
  telegramReadyCheck: boolean;
  telegramChampion: boolean;
  telegramGameStart: boolean;
  telegramGameEnd: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  autoAccept: false,
  overlayEnabled: true,
  overlayPosition: 'center',
  overlayOpacity: 0.9,
  autoNavigate: true,
  autoRunes: false,
  minimizeToTray: true,
  startWithWindows: false,
  telegramReadyCheck: true,
  telegramChampion: true,
  telegramGameStart: true,
  telegramGameEnd: true,
};

/** Validação de cada preferência: valores fora do formato são ignorados. */
const VALIDATORS: { [K in keyof Preferences]: (value: unknown) => value is Preferences[K] } = {
  autoAccept: isBoolean,
  overlayEnabled: isBoolean,
  overlayPosition: (value): value is OverlayPosition =>
    value === 'left' || value === 'center' || value === 'right',
  overlayOpacity: (value): value is number =>
    typeof value === 'number' && value >= 0.4 && value <= 1,
  autoNavigate: isBoolean,
  autoRunes: isBoolean,
  minimizeToTray: isBoolean,
  startWithWindows: isBoolean,
  telegramReadyCheck: isBoolean,
  telegramChampion: isBoolean,
  telegramGameStart: isBoolean,
  telegramGameEnd: isBoolean,
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

interface StoredSettings extends Partial<Preferences> {
  platformId?: string;
  /** Token do aparelho no bot do Telegram (dado pelo servidor ao conectar). */
  telegramDevice?: string;
}

/** Configurações locais em %APPDATA%\<app>\settings.json. */
export class Settings {
  private readonly file = path.join(app.getPath('userData'), 'settings.json');
  private data: StoredSettings = this.read();

  getPlatformId(): string | null {
    return this.data.platformId ?? null;
  }

  setPlatformId(platformId: string): void {
    this.data.platformId = platformId;
    this.write();
  }

  getPreferences(): Preferences {
    const preferences = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>) {
      const value = this.data[key];
      if (VALIDATORS[key](value)) (preferences as Record<string, unknown>)[key] = value;
    }
    return preferences;
  }

  /** Aceita só chaves conhecidas com valores no formato esperado. */
  updatePreferences(changes: Partial<Preferences>): Preferences {
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>) {
      const value = changes[key];
      if (VALIDATORS[key](value)) (this.data as Record<string, unknown>)[key] = value;
    }
    this.write();
    return this.getPreferences();
  }

  getTelegramDevice(): string | null {
    return this.data.telegramDevice ?? null;
  }

  setTelegramDevice(device: string | null): void {
    if (device) this.data.telegramDevice = device;
    else delete this.data.telegramDevice;
    this.write();
  }

  getAutoAccept(): boolean {
    return this.getPreferences().autoAccept;
  }

  private read(): StoredSettings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as StoredSettings & {
        riotApiKey?: string;
      };
      // Versões anteriores guardavam a chave da Riot aqui; ela agora fica só no servidor.
      const { riotApiKey, ...cleaned } = raw;
      if (riotApiKey) writeFileSync(this.file, JSON.stringify(cleaned, null, 2));
      return cleaned;
    } catch {
      return {};
    }
  }

  private write(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
