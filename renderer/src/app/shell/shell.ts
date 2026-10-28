import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationService, VIEW_TITLES, type View } from '../core/navigation.service';
import { PreferencesService } from '../core/preferences.service';
import { ToastService, errorText } from '../core/toast.service';
import { HistoryView } from '../history/history-view';
import { LcuService } from '../lcu/lcu.service';
import { LiveDataService } from '../live/live-data.service';
import { Icon } from '../ui/icon';
import { BuildsView } from '../views/builds-view';
import { ChampSelectView } from '../views/champ-select-view';
import { HomeView } from '../views/home-view';
import { LiveView } from '../views/live-view';
import { PlayView } from '../views/play-view';
import { SettingsView } from '../views/settings-view';
import { TierListView } from '../views/tierlist-view';
import { isAndroid } from '../mobile/mobile-client';
import { AndroidUpdate } from '../mobile/android-update';
import { WhatsNew } from './whats-new';

interface NavItem {
  view: View;
  label: string;
  /** Rótulo curto para a barra de abas do celular. */
  short?: string;
  icon: string;
}

/** Fluxo da partida (da sala à partida) e, separado, as consultas. */
const NAV_GROUPS: NavItem[][] = [
  [
    { view: 'home', label: 'Início', icon: 'home' },
    { view: 'play', label: 'Jogar', icon: 'play' },
    { view: 'champ-select', label: 'Seleção', icon: 'swords' },
    { view: 'live', label: 'Partida ao vivo', short: 'Ao vivo', icon: 'live' },
  ],
  [
    { view: 'tierlist', label: 'Tier list', icon: 'layers' },
    { view: 'builds', label: 'Builds', icon: 'book' },
    { view: 'history', label: 'Histórico', icon: 'history' },
  ],
];

/** Celular: 4 abas do fluxo da partida + "Mais" (consultas e configurações). */
const PHONE_TABS: NavItem[] = NAV_GROUPS[0];
const PHONE_MORE: NavItem[] = [
  ...NAV_GROUPS[1],
  { view: 'settings', label: 'Configurações', icon: 'settings' },
];

/** Tom do indicador de fase: cor e se pulsa. */
type PhaseTone = 'off' | 'idle' | 'queue' | 'alert' | 'active' | 'live';

interface PhaseInfo {
  tone: PhaseTone;
  label: string;
  /** Tempo na fila ou relógio da partida. */
  detail: string | null;
  /** Tela que o indicador abre ao clicar. */
  view: View | null;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-shell',
  imports: [
    WhatsNew,
    Icon,
    HomeView,
    PlayView,
    ChampSelectView,
    LiveView,
    TierListView,
    BuildsView,
    HistoryView,
    SettingsView,
    AndroidUpdate,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly lcu = inject(LcuService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly nav = inject(NavigationService);
  protected readonly toast = inject(ToastService);

  private readonly live = inject(LiveDataService);

  protected readonly state = this.lcu.state;
  protected readonly groups = NAV_GROUPS;
  protected readonly android = isAndroid;
  protected readonly phoneTabs = PHONE_TABS;
  protected readonly phoneMore = PHONE_MORE;
  protected readonly moreOpen = signal(false);
  protected readonly title = computed(() => VIEW_TITLES[this.nav.view()]);

  /** Aba "Mais" ativa quando a tela atual é uma das consultas ou as configurações. */
  protected readonly moreActive = computed(() =>
    PHONE_MORE.some((item) => item.view === this.nav.view()),
  );

  protected viewTitle(view: View): string {
    return VIEW_TITLES[view];
  }

  protected goPhone(view: View): void {
    this.moreOpen.set(false);
    this.nav.go(view);
  }

  protected readonly phase = computed<PhaseInfo>(() => {
    const state = this.state();
    if (state.status !== 'connected') {
      return {
        tone: 'off',
        label: state.status === 'connecting' ? 'Conectando ao cliente…' : 'Cliente do LoL fechado',
        detail: null,
        view: null,
      };
    }
    switch (state.gameflowPhase) {
      case 'Lobby':
        return { tone: 'idle', label: 'Na sala', detail: null, view: 'play' };
      case 'Matchmaking':
        return {
          tone: 'queue',
          label: 'Na fila',
          detail: state.search ? clock(state.search.timeInQueue) : null,
          view: 'play',
        };
      case 'ReadyCheck':
        return { tone: 'alert', label: 'Partida encontrada', detail: null, view: null };
      case 'ChampSelect':
        return { tone: 'active', label: 'Seleção de campeões', detail: null, view: 'champ-select' };
      case 'GameStart':
        return { tone: 'active', label: 'Carregando a partida', detail: null, view: 'live' };
      case 'InProgress':
      case 'Reconnect': {
        const time = this.live.clock();
        return {
          tone: 'live',
          label: 'Em partida',
          detail: time > 0 ? clock(time) : null,
          view: 'live',
        };
      }
      case 'WaitingForStats':
      case 'PreEndOfGame':
      case 'EndOfGame':
        return { tone: 'idle', label: 'Fim de jogo', detail: null, view: 'live' };
      default:
        return { tone: 'idle', label: 'No menu principal', detail: null, view: null };
    }
  });

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
        // Fim de partida: o pódio e os gráficos ficam na mesma tela.
        if (phase === 'EndOfGame') this.nav.go('live');
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
