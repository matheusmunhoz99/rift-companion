import { Component, computed, inject, signal } from '@angular/core';
import type { InvisibleStartupStatus, InvisibleStatus } from '../core/app.types';
import { PreferencesService } from '../core/preferences.service';
import { VoiceService } from '../live/voice.service';
import { ToastService, errorText } from '../core/toast.service';
import { Icon } from '../ui/icon';
import { Switch } from '../ui/switch';
import { MobileLink } from '../mobile/mobile-link';
import { isAndroid, isLinked } from '../mobile/mobile-client';
import { gameWatchEnabled, gameWatchError, setGameWatch } from '../mobile/game-watch';

interface TelegramBridge {
  status(): Promise<{ connected: boolean }>;
  connect(): Promise<{ connected: boolean }>;
  cancel(): Promise<void>;
  test(): Promise<void>;
  disconnect(): Promise<void>;
}

declare global {
  interface Window {
    telegram?: TelegramBridge;
  }
}

type SettingsTab = 'invisivel' | 'jogo' | 'avisos' | 'app';

// Espelha electron/tray.ts.
const STATUSES: Array<{ value: InvisibleStatus; label: string; description: string }> = [
  { value: 'offline', label: 'Offline', description: 'Ninguém vê você conectado nem o que está jogando.' },
  { value: 'mobile', label: 'Celular', description: 'Aparece como no app do celular, sem fila nem partida.' },
  { value: 'online', label: 'Online', description: 'Status normal, com fila e partida visíveis.' },
];

const STARTUP_STATUSES: Array<{ value: InvisibleStartupStatus; label: string }> = [
  { value: 'last', label: 'Lembrar o último' },
  { value: 'offline', label: 'Offline' },
  { value: 'mobile', label: 'Celular' },
  { value: 'online', label: 'Online' },
];

@Component({
  selector: 'app-settings-view',
  imports: [Switch, Icon, MobileLink],
  templateUrl: './settings-view.html',
  styleUrl: './settings-view.scss',
})
export class SettingsView {
  protected readonly android = isAndroid;
  protected readonly gameWatch = gameWatchEnabled;
  protected readonly gameWatchError = gameWatchError;

  protected toggleGameWatch(enabled: boolean): void {
    void setGameWatch(enabled, isLinked());
  }
  protected readonly prefs = inject(PreferencesService);
  protected readonly statuses = STATUSES;
  protected readonly startupStatuses = STARTUP_STATUSES;

  /** Aba aberta: agrupa as configurações para a tela não virar um scroll só. */
  protected readonly tab = signal<SettingsTab>('invisivel');
  protected readonly tabs: Array<{ key: SettingsTab; label: string; icon: string }> = [
    { key: 'invisivel', label: 'Invisível', icon: 'eye-off' },
    { key: 'jogo', label: 'Partida', icon: 'swords' },
    { key: 'avisos', label: 'Avisos', icon: 'chat' },
    { key: 'app', label: 'App', icon: 'settings' },
  ];

  /** Como os amigos veem você agora; desativado conta como online. */
  protected readonly currentStatus = computed<InvisibleStatus | 'disabled'>(() => {
    const p = this.prefs.preferences();
    return p.appearOffline ? p.invisibleStatus : 'disabled';
  });
  protected readonly statusSummary = computed(() => ({
    disabled: 'Desativado',
    offline: 'Você aparece offline',
    mobile: 'Você aparece no celular',
    online: 'Você aparece online',
  })[this.currentStatus()]);

  private readonly toast = inject(ToastService);
  private readonly voice = inject(VoiceService);
  /** Telegram: conectado, desconectado ou esperando a pessoa tocar em "Iniciar" no bot. */
  protected readonly telegram = signal<'connected' | 'disconnected' | 'waiting'>('disconnected');
  protected readonly telegramBusy = signal(false);

  constructor() {
    void this.prefs.refreshGameWindowMode();
    void window.app?.visionStatus?.().then((s) => this.visionStatus.set(s)).catch(() => undefined);
    void window.telegram?.status().then((s) => this.telegram.set(s.connected ? 'connected' : 'disconnected'));
  }

  protected async connectTelegram(): Promise<void> {
    if (!window.telegram) return;
    this.telegram.set('waiting');
    try {
      const result = await window.telegram.connect();
      this.telegram.set(result.connected ? 'connected' : 'disconnected');
      if (result.connected) this.toast.show('Telegram conectado. Mandei uma mensagem de boas-vindas.', 'success');
    } catch (error) {
      this.telegram.set('disconnected');
      this.toast.show(errorText(error), 'error');
    }
  }

  protected cancelTelegram(): void {
    void window.telegram?.cancel();
  }

  protected async testTelegram(): Promise<void> {
    await this.telegramAction(async () => {
      await window.telegram!.test();
      this.toast.show('Mensagem de teste enviada. Confira o Telegram.', 'success');
    });
  }

  protected async disconnectTelegram(): Promise<void> {
    await this.telegramAction(async () => {
      await window.telegram!.disconnect();
      this.telegram.set('disconnected');
      this.toast.show('Telegram desconectado.', 'success');
    });
  }

  private async telegramAction(action: () => Promise<void>): Promise<void> {
    this.telegramBusy.set(true);
    try {
      await action();
    } catch (error) {
      this.toast.show(errorText(error), 'error');
      const status = await window.telegram?.status().catch(() => null);
      if (status && !status.connected) this.telegram.set('disconnected');
    } finally {
      this.telegramBusy.set(false);
    }
  }

  protected readonly checking = signal(false);
  protected readonly updateMessage = signal<string | null>(null);

  protected async checkUpdate(): Promise<void> {
    this.checking.set(true);
    const status = await this.prefs.checkUpdate();
    this.checking.set(false);
    this.updateMessage.set(
      status.state === 'available' ? `Versão ${status.release.version} disponível: use o aviso no topo para atualizar.` : 'Você está na versão mais recente.',
    );
  }

  /** Visão da tela: amostras gravadas e se a captura veio preta (tela cheia exclusiva). */
  protected readonly visionStatus = signal<{ black: boolean | null; samples: number; folder: string } | null>(null);

  protected readonly canSetBorderless = !!window.app?.setBorderless;
  protected readonly switchingWindow = signal(false);

  /** Troca o jogo para Sem bordas pela API do cliente (a leitura do minimapa passa a funcionar). */
  protected async switchToBorderless(): Promise<void> {
    this.switchingWindow.set(true);
    try {
      const result = await window.app!.setBorderless!();
      const messages = {
        changed: ['Pronto: o jogo abre em Sem bordas na próxima partida.', 'success'],
        already: ['O jogo já está em Sem bordas.', 'success'],
        'in-game': ['Termine a partida primeiro: a troca é feita pelo cliente, fora do jogo.', 'error'],
        'no-client': ['Abra o cliente do LoL para trocar o modo de janela.', 'error'],
      } as const;
      const [text, kind] = messages[result];
      this.toast.show(text, kind);
      await this.prefs.refreshGameWindowMode();
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    } finally {
      this.switchingWindow.set(false);
    }
  }

  protected openVisionSamples(): void {
    void window.app?.openVisionSamples?.();
  }

  protected setVoiceVolume(value: string): void {
    void this.prefs.set({ voiceVolume: Math.round(Number(value)) / 100 });
  }

  /** Exemplo com o volume escolhido (fala mesmo fora da partida). */
  protected testVoice(): void {
    this.voice.say('Barão em 30 segundos', true);
  }

  protected openBuildsFolder(): void {
    void window.app?.openBuildsFolder();
  }
}
