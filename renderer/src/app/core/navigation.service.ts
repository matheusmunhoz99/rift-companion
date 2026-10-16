import { Injectable, signal } from '@angular/core';

export type View = 'home' | 'play' | 'champ-select' | 'live' | 'builds' | 'history' | 'settings';

export const VIEW_TITLES: Record<View, string> = {
  home: 'Início',
  play: 'Jogar',
  'champ-select': 'Seleção de campeões',
  live: 'Partida ao vivo',
  builds: 'Builds e runas',
  history: 'Histórico de partidas',
  settings: 'Configurações',
};

/** Busca de jogador pedida por outra tela (ex.: clique num nome na partida ao vivo). */
export interface PlayerRequest {
  riotId: string;
  platformId: string | null;
  /** Muda a cada pedido para que o mesmo jogador possa ser aberto de novo. */
  token: number;
}

@Injectable({ providedIn: 'root' })
export class NavigationService {
  readonly view = signal<View>(initialView());
  readonly playerRequest = signal<PlayerRequest | null>(null);

  go(view: View): void {
    this.view.set(view);
  }

  /** Abre o histórico do jogador (Riot ID no formato Nome#TAG). */
  openPlayer(riotId: string, platformId: string | null = null): void {
    if (!riotId.includes('#')) return;
    this.playerRequest.set({ riotId, platformId, token: Date.now() });
    this.view.set('history');
  }
}

/** Tela inicial pelo hash (#view=builds), usado na revisão visual. */
function initialView(): View {
  const match = location.hash.match(/view=([\w-]+)/);
  const view = match?.[1] as View | undefined;
  return view && view in VIEW_TITLES ? view : 'home';
}
