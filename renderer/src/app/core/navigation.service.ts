import { Injectable, signal } from '@angular/core';

export type View = 'home' | 'play' | 'champ-select' | 'live' | 'tierlist' | 'builds' | 'history' | 'settings';

export const VIEW_TITLES: Record<View, string> = {
  home: 'Início',
  play: 'Jogar',
  'champ-select': 'Seleção de campeões',
  live: 'Partida ao vivo',
  tierlist: 'Tier list',
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
  readonly playerRequest = signal<PlayerRequest | null>(initialPlayer());
  /** Campeão aberto na tela Builds a partir de outra tela (ex.: tier list). */
  readonly buildsRequest = signal<{ championId: number; position: string | null } | null>(initialBuilds());

  go(view: View): void {
    this.view.set(view);
  }

  openBuilds(championId: number, position: string | null = null): void {
    this.buildsRequest.set({ championId, position });
    this.view.set('builds');
  }

  /** Abre o histórico do jogador (Riot ID no formato Nome#TAG). */
  openPlayer(riotId: string, platformId: string | null = null): void {
    if (!riotId.includes('#')) return;
    this.playerRequest.set({ riotId, platformId, token: Date.now() });
    this.view.set('history');
  }
}

/** Jogador inicial pelo hash (#view=history&player=Nome%23TAG), usado na revisão visual. */
function initialPlayer(): PlayerRequest | null {
  const match = location.hash.match(/player=([^&]+)/);
  return match ? { riotId: decodeURIComponent(match[1]), platformId: null, token: 1 } : null;
}

/** Campeão inicial pelo hash (#view=builds&champion=19&position=JUNGLE), usado na revisão visual. */
function initialBuilds(): { championId: number; position: string | null } | null {
  const champion = location.hash.match(/champion=(\d+)/);
  const position = location.hash.match(/position=([A-Z]+)/);
  return champion ? { championId: Number(champion[1]), position: position?.[1] ?? null } : null;
}

/** Tela inicial pelo hash (#view=builds), usado na revisão visual. */
function initialView(): View {
  const match = location.hash.match(/view=([\w-]+)/);
  const view = match?.[1] as View | undefined;
  return view && view in VIEW_TITLES ? view : 'home';
}
