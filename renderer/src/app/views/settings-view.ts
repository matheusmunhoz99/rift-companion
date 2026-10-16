import { Component, inject } from '@angular/core';
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

  protected setOpacity(value: string): void {
    void this.prefs.set({ overlayOpacity: Math.round(Number(value)) / 100 });
  }

  protected openBuildsFolder(): void {
    void window.app?.openBuildsFolder();
  }
}
