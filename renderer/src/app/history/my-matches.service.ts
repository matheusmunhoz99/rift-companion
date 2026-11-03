import { Injectable, computed, inject, signal } from '@angular/core';
import { LcuService } from '../lcu/lcu.service';
import type { MatchParticipant, MatchSummary } from './riot.types';

/** Páginas de 20 (o máximo do servidor): 40 partidas dão base para duo e pool de campeões. */
const PAGE = 20;
const PAGES = 2;
/** Recarrega depois disso (uma partida nova entra no histórico). */
const STALE_MS = 10 * 60 * 1000;

export interface MyMatches {
  puuid: string;
  matches: MatchSummary[];
  /** Você em cada partida, na mesma ordem (mais novas primeiro). */
  rows: Array<{ match: MatchSummary; me: MatchParticipant }>;
}

/**
 * Suas últimas partidas (Riot API + cliente), buscadas uma vez e guardadas por alguns
 * minutos: a seleção (sugestão de campeão) e o Progresso (duo) usam a mesma lista.
 */
@Injectable({ providedIn: 'root' })
export class MyMatchesService {
  private readonly lcu = inject(LcuService);
  readonly data = signal<MyMatches | null>(null);
  readonly loading = signal(false);
  private loadedAt = 0;
  private loadedFor = '';
  private pending: Promise<MyMatches | null> | null = null;

  /** Você: a conta logada no LoL ou, com o cliente fechado, a última salva neste PC. */
  private readonly me = computed(() => {
    const { summoner, platformId, account } = this.lcu.state();
    if (summoner?.gameName && summoner.tagLine) {
      return { gameName: summoner.gameName, tagLine: summoner.tagLine, platformId: platformId ?? account?.platformId ?? 'BR1' };
    }
    return account ? { gameName: account.gameName, tagLine: account.tagLine, platformId: account.platformId } : null;
  });

  /** Garante a lista (usa a guardada se for recente e da mesma conta). */
  load(): Promise<MyMatches | null> {
    const me = this.me();
    if (!me || !window.riot) return Promise.resolve(null);
    const key = `${me.platformId}:${me.gameName}#${me.tagLine}`.toLowerCase();
    if (this.data() && this.loadedFor === key && Date.now() - this.loadedAt < STALE_MS) return Promise.resolve(this.data());
    if (this.pending) return this.pending;
    this.loading.set(true);
    this.pending = this.fetch(me.gameName, me.tagLine, me.platformId)
      .then((data) => {
        this.data.set(data);
        this.loadedAt = Date.now();
        this.loadedFor = key;
        return data;
      })
      .catch(() => this.data())
      .finally(() => {
        this.pending = null;
        this.loading.set(false);
      });
    return this.pending;
  }

  private async fetch(gameName: string, tagLine: string, platformId: string): Promise<MyMatches> {
    const riot = window.riot!;
    const profile = await riot.findPlayer(gameName, tagLine, platformId);
    const matches: MatchSummary[] = [];
    for (let page = 0; page < PAGES; page++) {
      const list = await riot.getMatches(profile.puuid, platformId, page * PAGE, PAGE).catch(() => []);
      matches.push(...list.filter((m) => !matches.some((known) => known.matchId === m.matchId)));
      if (list.length < PAGE) break;
    }
    const rows = matches
      .map((match) => ({ match, me: match.participants.find((p) => p.puuid === profile.puuid)! }))
      .filter((row) => !!row.me);
    return { puuid: profile.puuid, matches, rows };
  }
}
