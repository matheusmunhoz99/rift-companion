import { Injectable, inject, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { AppInfo, GameWindowMode, Preferences } from './app.types';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly toast = inject(ToastService);
  private readonly ddragon = inject(DataDragonService);

  readonly preferences = signal<Preferences>({
    autoAccept: false,
    overlayEnabled: true,
    overlayPosition: 'center',
    overlayOpacity: 0.9,
    autoNavigate: true,
    autoRunes: false,
    minimizeToTray: true,
    startWithWindows: false,
  });
  readonly info = signal<AppInfo | null>(null);
  readonly lastAutoAccept = signal<string | null>(null);
  readonly gameWindowMode = signal<GameWindowMode>('unknown');

  constructor() {
    const bridge = window.app;
    if (!bridge) return;
    void bridge.getPreferences().then((preferences) => this.preferences.set(preferences));
    void bridge.info().then((info) => this.info.set(info));
    void this.refreshGameWindowMode();

    bridge.onPreferencesChanged((preferences) => this.preferences.set(preferences));
    bridge.onAutoAccepted((timestamp) => {
      const time = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      this.lastAutoAccept.set(time);
      this.toast.show('Partida aceita automaticamente.', 'success');
    });
    bridge.onAutoRunesApplied(({ championId, pageName }) => {
      const champion = this.ddragon.champion(championId)?.name ?? 'seu campeão';
      this.toast.show(`Runas de ${champion} importadas em "${pageName}".`, 'success');
    });
  }

  async set(changes: Partial<Preferences>): Promise<void> {
    this.preferences.update((current) => ({ ...current, ...changes }));
    const saved = await window.app?.setPreferences(changes);
    if (saved) this.preferences.set(saved);
  }

  async refreshGameWindowMode(): Promise<void> {
    const mode = await window.app?.gameWindowMode().catch(() => 'unknown' as const);
    if (mode) this.gameWindowMode.set(mode);
  }
}
