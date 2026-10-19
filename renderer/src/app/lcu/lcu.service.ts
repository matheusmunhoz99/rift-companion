import { Injectable, signal } from '@angular/core';
import type { LcuState } from './lcu.types';

@Injectable({ providedIn: 'root' })
export class LcuService {
  /** false quando a página roda fora do Electron (ex.: ng serve no navegador). */
  readonly available = typeof window !== 'undefined' && !!window.lcu;

  readonly state = signal<LcuState>({
    status: 'waiting-client',
    summoner: null,
    gameflowPhase: null,
    champSelect: null,
    platformId: null,
    lobby: null,
    search: null,
    readyCheck: null,
  });

  /**
   * Riot IDs (minúsculos) da última sala com mais de uma pessoa: o seu grupo na fila.
   * Fica guardado depois que a sala some, para a partida ao vivo marcar o seu duo/trio.
   */
  readonly party = signal<string[]>([]);

  constructor() {
    const bridge = window.lcu;
    if (!bridge) return;

    const apply = (state: LcuState) => {
      this.state.set(state);
      const members = state.lobby?.members ?? [];
      if (members.length > 0) {
        const ids = members.filter((m) => m.gameName).map((m) => `${m.gameName}#${m.tagLine}`.toLowerCase());
        this.party.set(ids.length > 1 ? ids : []);
      }
    };
    bridge.onState(apply);
    void bridge.getState().then(apply);
  }
}
