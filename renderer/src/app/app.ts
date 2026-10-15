import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { PreferencesService } from './core/preferences.service';
import { HistoryView } from './history/history-view';
import { LcuService } from './lcu/lcu.service';
import { OverlayView } from './overlay/overlay-view';
import { Icon } from './ui/icon';
import { BuildsView } from './views/builds-view';
import { ChampSelectView } from './views/champ-select-view';
import { HomeView } from './views/home-view';
import { LiveView } from './views/live-view';
import { SettingsView } from './views/settings-view';

export type View = 'home' | 'champ-select' | 'live' | 'builds' | 'history' | 'settings';

interface NavItem {
  view: View;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { view: 'home', label: 'Início', icon: 'home' },
  { view: 'champ-select', label: 'Seleção', icon: 'swords' },
  { view: 'live', label: 'Partida ao vivo', icon: 'live' },
  { view: 'builds', label: 'Builds', icon: 'book' },
  { view: 'history', label: 'Histórico', icon: 'history' },
];

const TITLES: Record<View, string> = {
  home: 'Início',
  'champ-select': 'Seleção de campeões',
  live: 'Partida ao vivo',
  builds: 'Builds e runas',
  history: 'Histórico de partidas',
  settings: 'Configurações',
};

const STATUS_LABELS = {
  'waiting-client': 'Cliente fechado',
  connecting: 'Conectando…',
  connected: 'Cliente conectado',
} as const;

@Component({
  selector: 'app-root',
  imports: [Icon, HomeView, ChampSelectView, LiveView, BuildsView, HistoryView, SettingsView, OverlayView],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** A janela do overlay carrega o mesmo app com #overlay. */
  protected readonly overlayMode = location.hash === '#overlay';

  private readonly lcu = inject(LcuService);
  protected readonly prefs = inject(PreferencesService);

  protected readonly state = this.lcu.state;
  protected readonly nav = NAV;
  protected readonly view = signal<View>(initialView());
  protected readonly title = computed(() => TITLES[this.view()]);
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.state().status]);

  protected readonly inChampSelect = computed(() => !!this.state().champSelect);
  protected readonly inGame = computed(() => {
    const phase = this.state().gameflowPhase;
    return phase === 'InProgress' || phase === 'Reconnect';
  });

  private lastPhase: string | null = null;

  constructor() {
    if (this.overlayMode) {
      document.body.classList.add('overlay-mode');
      return;
    }

    // Abre a tela certa quando a fase muda (pode ser desligado nas configurações).
    effect(() => {
      const phase = this.state().gameflowPhase;
      untracked(() => {
        if (phase === this.lastPhase) return;
        this.lastPhase = phase;
        if (!this.prefs.preferences().autoNavigate) return;
        if (phase === 'ChampSelect') this.view.set('champ-select');
        if (phase === 'InProgress') this.view.set('live');
      });
    });
  }

  protected badge(view: View): boolean {
    return (view === 'champ-select' && this.inChampSelect()) || (view === 'live' && this.inGame());
  }
}

/** Tela inicial pelo hash (#view=builds), usado na revisão visual. */
function initialView(): View {
  const match = location.hash.match(/view=([\w-]+)/);
  const view = match?.[1] as View | undefined;
  return view && view in TITLES ? view : 'home';
}
