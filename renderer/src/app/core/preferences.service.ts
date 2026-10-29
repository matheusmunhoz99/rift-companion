import { Injectable, inject, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { AppInfo, GameWindowMode, Preferences, UpdateStatus } from './app.types';
import { ToastService, errorText } from './toast.service';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly toast = inject(ToastService);
  private readonly ddragon = inject(DataDragonService);

  readonly preferences = signal<Preferences>({
    autoAccept: false,
    appearOffline: false,
    invisibleStatus: 'offline',
    invisibleStartupStatus: 'last',
    invisibleLobbyChat: true,
    overlayEnabled: true,
    overlayPosition: 'center',
    overlayOpacity: 0.9,
    autoNavigate: true,
    autoRunes: false,
    minimizeToTray: true,
    startWithWindows: false,
    showAsRiftUser: true,
    chatObjectiveAlerts: true,
    telegramReadyCheck: true,
    telegramChampion: true,
    telegramGameStart: true,
    telegramGameEnd: true,
  });
  readonly info = signal<AppInfo | null>(null);
  readonly lastAutoAccept = signal<string | null>(null);
  readonly gameWindowMode = signal<GameWindowMode>('unknown');
  readonly update = signal<UpdateStatus>({ state: 'idle' });

  constructor() {
    const bridge = window.app;
    if (!bridge) return;
    void bridge.getPreferences().then((preferences) => this.preferences.set(preferences));
    void bridge.info().then((info) => this.info.set(info));
    void this.refreshGameWindowMode();

    bridge.onPreferencesChanged((preferences) => this.preferences.set(preferences));
    void bridge.updateStatus().then((status) => this.update.set(status));
    bridge.onUpdateStatus((status) => this.update.set(status));
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
    const previous = this.preferences();
    this.preferences.update((current) => ({ ...current, ...changes }));
    try {
      const saved = await window.app?.setPreferences(changes);
      if (saved) this.preferences.set(saved);
    } catch (error) {
      console.error('prefs.set falhou:', error);
      this.preferences.set(previous);
      this.toast.show(errorText(error), 'error');
    }
  }

  async checkUpdate(): Promise<UpdateStatus> {
    const status = (await window.app?.checkUpdate()) ?? { state: 'idle' as const };
    this.update.set(status);
    return status;
  }

  async installUpdate(): Promise<void> {
    try {
      await window.app?.installUpdate();
      this.toast.show('Atualização baixada. Abrindo a nova versão…', 'success');
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    }
  }

  async refreshGameWindowMode(): Promise<void> {
    const mode = await window.app?.gameWindowMode().catch(() => 'unknown' as const);
    if (mode) this.gameWindowMode.set(mode);
  }
}
