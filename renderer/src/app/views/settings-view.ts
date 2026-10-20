import { Component, computed, inject, signal } from '@angular/core';
import type { InvisibleStartupStatus, InvisibleStatus, OverlayPosition } from '../core/app.types';
import { PreferencesService } from '../core/preferences.service';
import { ToastService, errorText } from '../core/toast.service';
import { Icon } from '../ui/icon';
import { Switch } from '../ui/switch';

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

const POSITIONS: Array<{ value: OverlayPosition; label: string }> = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' },
];

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
  imports: [Switch, Icon],
  templateUrl: './settings-view.html',
  styleUrl: './settings-view.scss',
})
export class SettingsView {
  protected readonly prefs = inject(PreferencesService);
  protected readonly positions = POSITIONS;
  protected readonly statuses = STATUSES;
  protected readonly startupStatuses = STARTUP_STATUSES;

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
  /** Telegram: conectado, desconectado ou esperando a pessoa tocar em "Iniciar" no bot. */
  protected readonly telegram = signal<'connected' | 'disconnected' | 'waiting'>('disconnected');
  protected readonly telegramBusy = signal(false);

  constructor() {
    void this.prefs.refreshGameWindowMode();
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

  protected setOpacity(value: string): void {
    void this.prefs.set({ overlayOpacity: Math.round(Number(value)) / 100 });
  }

  protected openBuildsFolder(): void {
    void window.app?.openBuildsFolder();
  }
}
