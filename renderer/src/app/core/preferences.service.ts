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
    autoNavigate: true,
    matchMode: true,
    matchModeWindow: true,
    matchModeFullscreen: false,
    focusOnChampSelect: true,
    autoRunes: false,
    minimizeToTray: true,
    startWithWindows: false,
    showAsRiftUser: true,
    chatObjectiveAlerts: true,
    voiceAlerts: true,
    voiceVolume: 0.8,
    appShortcut: true,
    liveRead: true,
    liveReadVoice: true,
    jungleHotkeys: true,
    screenVision: false,
    visionSamples: false,
    autoJungle: false,
    sendErrorReports: true,
    detailedDiagnostics: false,
    telegramReadyCheck: true,
    telegramChampion: true,
    telegramGameStart: true,
    telegramGameEnd: true,
  });
  readonly info = signal<AppInfo | null>(null);
  readonly lastAutoAccept = signal<string | null>(null);
  readonly gameWindowMode = signal<GameWindowMode>('unknown');
  readonly update = signal<UpdateStatus>({ state: 'idle' });
  /** LoL aberto sem o modo invisível: a janela mostra uma faixa discreta (nunca um pop-up). */
  readonly invisibleMissing = signal(false);
  readonly invisibleRestarting = signal(false);

  constructor() {
    const bridge = window.app;
    if (!bridge) return;
    void bridge.invisibleMissing?.().then((missing) => this.invisibleMissing.set(missing === true));
    bridge.onInvisibleMissing?.((missing) => this.invisibleMissing.set(missing === true));
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

  /** Botão da faixa: reinicia o LoL já invisível, quando o jogador quiser. */
  async restartInvisible(): Promise<void> {
    if (!window.app?.restartInvisible || this.invisibleRestarting()) return;
    this.invisibleRestarting.set(true);
    try {
      const result = await window.app.restartInvisible();
      if (result === 'waiting') this.toast.show('Você está numa fila ou partida. Tente de novo quando acabar.', 'error');
      else if (result === 'restarted') this.toast.show('Reabrindo o LoL invisível…', 'success');
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    } finally {
      this.invisibleRestarting.set(false);
    }
  }

  async checkUpdate(): Promise<UpdateStatus> {
    const status = (await window.app?.checkUpdate()) ?? { state: 'idle' as const };
    this.update.set(status);
    return status;
  }

  async installUpdate(): Promise<void> {
    try {
      // false = adiada na confirmação (durante a seleção ou a partida).
      if ((await window.app?.installUpdate()) === false) return;
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
