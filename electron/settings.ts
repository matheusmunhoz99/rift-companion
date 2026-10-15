import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Preferences {
  autoAccept: boolean;
  overlayEnabled: boolean;
  /** Abre a tela certa sozinho (seleção, partida) conforme a fase do cliente. */
  autoNavigate: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  autoAccept: false,
  overlayEnabled: true,
  autoNavigate: true,
};

interface StoredSettings extends Partial<Preferences> {
  platformId?: string;
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
    return {
      autoAccept: this.data.autoAccept ?? DEFAULT_PREFERENCES.autoAccept,
      overlayEnabled: this.data.overlayEnabled ?? DEFAULT_PREFERENCES.overlayEnabled,
      autoNavigate: this.data.autoNavigate ?? DEFAULT_PREFERENCES.autoNavigate,
    };
  }

  /** Aceita só chaves conhecidas com valor booleano. */
  updatePreferences(changes: Partial<Preferences>): Preferences {
    for (const key of Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>) {
      if (typeof changes[key] === 'boolean') this.data[key] = changes[key];
    }
    this.write();
    return this.getPreferences();
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
