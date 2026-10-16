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

  constructor() {
    const bridge = window.lcu;
    if (!bridge) return;

    bridge.onState((state) => this.state.set(state));
    void bridge.getState().then((state) => this.state.set(state));
  }
}
