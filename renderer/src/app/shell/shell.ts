import { Component, computed, effect, inject, untracked } from '@angular/core';
import { NavigationService, VIEW_TITLES, type View } from '../core/navigation.service';
import { PreferencesService } from '../core/preferences.service';
import { ToastService, errorText } from '../core/toast.service';
import { HistoryView } from '../history/history-view';
import { LcuService } from '../lcu/lcu.service';
import { Icon } from '../ui/icon';
import { BuildsView } from '../views/builds-view';
import { ChampSelectView } from '../views/champ-select-view';
import { HomeView } from '../views/home-view';
import { LiveView } from '../views/live-view';
import { PlayView } from '../views/play-view';
import { SettingsView } from '../views/settings-view';
import { TierListView } from '../views/tierlist-view';

interface NavItem {
  view: View;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { view: 'home', label: 'Início', icon: 'home' },
  { view: 'play', label: 'Jogar', icon: 'play' },
  { view: 'champ-select', label: 'Seleção', icon: 'swords' },
  { view: 'live', label: 'Partida ao vivo', icon: 'live' },
  { view: 'tierlist', label: 'Tier list', icon: 'layers' },
  { view: 'builds', label: 'Builds', icon: 'book' },
  { view: 'history', label: 'Histórico', icon: 'history' },
];

const STATUS_LABELS = {
  'waiting-client': 'Cliente fechado',
  connecting: 'Conectando…',
  connected: 'Cliente conectado',
} as const;

@Component({
  selector: 'app-shell',
  imports: [Icon, HomeView, PlayView, ChampSelectView, LiveView, TierListView, BuildsView, HistoryView, SettingsView],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly lcu = inject(LcuService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly nav = inject(NavigationService);
  protected readonly toast = inject(ToastService);

  protected readonly state = this.lcu.state;
  protected readonly items = NAV;
  protected readonly title = computed(() => VIEW_TITLES[this.nav.view()]);
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.state().status]);

  protected readonly inLobby = computed(() => {
    const phase = this.state().gameflowPhase;
    return phase === 'Lobby' || phase === 'Matchmaking' || phase === 'ReadyCheck';
  });
  protected readonly inChampSelect = computed(() => !!this.state().champSelect);
  protected readonly inGame = computed(() => {
    const phase = this.state().gameflowPhase;
    return phase === 'InProgress' || phase === 'Reconnect';
  });

  private lastPhase: string | null = null;

  constructor() {
    // Abre a tela certa quando a fase muda (pode ser desligado nas configurações).
    effect(() => {
      const phase = this.state().gameflowPhase;
      untracked(() => {
        if (phase === this.lastPhase) return;
        const previous = this.lastPhase;
        this.lastPhase = phase;
        if (phase === 'InProgress') void this.prefs.refreshGameWindowMode();
        if (!this.prefs.preferences().autoNavigate || previous === null) return;
        if (phase === 'ChampSelect') this.nav.go('champ-select');
        if (phase === 'InProgress') this.nav.go('live');
      });
    });
  }

  protected badge(view: View): boolean {
    return (
      (view === 'play' && this.inLobby()) ||
      (view === 'champ-select' && this.inChampSelect()) ||
      (view === 'live' && this.inGame())
    );
  }

  /** O cliente dá 12 segundos para responder; o timer conta o tempo já passado. */
  protected remaining(elapsed: number): number {
    return Math.max(0, Math.ceil(12 - elapsed));
  }

  protected async readyCheck(accept: boolean): Promise<void> {
    try {
      await window.lobby?.readyCheck(accept);
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    }
  }
}
