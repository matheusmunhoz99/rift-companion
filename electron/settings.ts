import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface StoredSettings {
  platformId?: string;
  autoAccept?: boolean;
}

/** Configurações locais em %APPDATA%\rift-companion\settings.json. */
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

  getAutoAccept(): boolean {
    return this.data.autoAccept ?? false;
  }

  setAutoAccept(enabled: boolean): void {
    this.data.autoAccept = enabled;
    this.write();
  }

  private read(): StoredSettings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as StoredSettings & {
        riotApiKey?: string;
      };
      // Versões anteriores guardavam a chave da Riot aqui; ela agora fica só no servidor.
      const cleaned: StoredSettings = { platformId: raw.platformId, autoAccept: raw.autoAccept };
      if (raw.riotApiKey) writeFileSync(this.file, JSON.stringify(cleaned, null, 2));
      return cleaned;
    } catch {
      return {};
    }
  }

  private write(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
