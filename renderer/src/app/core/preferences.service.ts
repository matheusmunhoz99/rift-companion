import { Injectable, signal } from '@angular/core';
import type { AppInfo, Preferences } from './app.types';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly preferences = signal<Preferences>({
    autoAccept: false,
    overlayEnabled: true,
    autoNavigate: true,
  });
  readonly info = signal<AppInfo | null>(null);
  readonly lastAutoAccept = signal<string | null>(null);

  constructor() {
    const bridge = window.app;
    if (!bridge) return;
    void bridge.getPreferences().then((preferences) => this.preferences.set(preferences));
    void bridge.info().then((info) => this.info.set(info));
    bridge.onAutoAccepted((timestamp) =>
      this.lastAutoAccept.set(
        new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      ),
    );
  }

  async set(changes: Partial<Preferences>): Promise<void> {
    this.preferences.update((current) => ({ ...current, ...changes }));
    const saved = await window.app?.setPreferences(changes);
    if (saved) this.preferences.set(saved);
  }
}
