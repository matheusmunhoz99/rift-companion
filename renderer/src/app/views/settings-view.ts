import { Component, inject, signal } from '@angular/core';
import type { OverlayPosition } from '../core/app.types';
import { PreferencesService } from '../core/preferences.service';
import { Icon } from '../ui/icon';
import { Switch } from '../ui/switch';

const POSITIONS: Array<{ value: OverlayPosition; label: string }> = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' },
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

  constructor() {
    void this.prefs.refreshGameWindowMode();
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
