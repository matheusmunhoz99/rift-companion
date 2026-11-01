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
   * Fica guardado depois que a sala some (e no disco, por algumas horas), para a partida ao
   * vivo marcar o seu duo/trio mesmo se o app for aberto ou atualizado no meio da partida.
   */
  readonly party = signal<string[]>(restoreParty());

  constructor() {
    const bridge = window.lcu;
    if (!bridge) return;

    const apply = (state: LcuState) => {
      this.state.set(state);
      const members = state.lobby?.members ?? [];
      if (members.length > 0) {
        const ids = members.filter((m) => m.gameName).map((m) => `${m.gameName}#${m.tagLine}`.toLowerCase());
        const party = ids.length > 1 ? ids : [];
        if (party.join() !== this.party().join()) saveParty(party);
        this.party.set(party);
      }
    };
    bridge.onState(apply);
    void bridge.getState().then(apply);
  }
}

const PARTY_KEY = 'rift.lastParty.v1';
/** A sala guardada vale por 6 h: cobre a partida mais longa, com folga. */
const PARTY_MS = 6 * 60 * 60_000;

function restoreParty(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PARTY_KEY) ?? 'null') as { ids?: unknown; at?: unknown } | null;
    const fresh = typeof saved?.at === 'number' && Date.now() - saved.at < PARTY_MS;
    return fresh && Array.isArray(saved?.ids) ? saved.ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveParty(ids: string[]): void {
  try {
    localStorage.setItem(PARTY_KEY, JSON.stringify({ ids, at: Date.now() }));
  } catch {
    // Sem armazenamento: a sala só vale enquanto o app estiver aberto.
  }
}
