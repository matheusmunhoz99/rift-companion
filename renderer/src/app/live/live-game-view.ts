import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveGame, LiveParticipant, MatchSummary } from '../history/riot.types';
import { LcuService } from '../lcu/lcu.service';
import { mainRank, queueName, rankText, winRate } from '../riot/labels';
import { estimateWinChance } from './win-chance';

const RECENT_GAMES = 10;
/** Enquanto a partida não aparece no spectator, tenta de novo a cada 20 s. */
const RETRY_MS = 20_000;

interface RecentSummary {
  games: number;
  wins: number;
  winRate: number;
  kda: string;
  /** Partidas recentes com o campeão desta partida. */
  championGames: number;
  championWins: number;
  results: boolean[];
}

@Component({
  selector: 'app-live-game-view',
  templateUrl: './live-game-view.html',
  styleUrl: './live-game-view.scss',
})
export class LiveGameView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);

  protected readonly game = signal<LiveGame | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly recent = signal<Record<string, RecentSummary | 'loading' | 'error'>>({});

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly me = computed(() => {
    const game = this.game();
    const summoner = this.lcu.state().summoner;
    if (!game || !summoner) return null;
    const riotId = `${summoner.gameName}#${summoner.tagLine}`.toLowerCase();
    return game.participants.find((p) => p.riotId.toLowerCase() === riotId) ?? null;
  });

  protected readonly allyTeamId = computed(() => this.me()?.teamId ?? 100);

  protected readonly allies = computed(() =>
    (this.game()?.participants ?? []).filter((p) => p.teamId === this.allyTeamId()),
  );

  protected readonly enemies = computed(() =>
    (this.game()?.participants ?? []).filter((p) => p.teamId !== this.allyTeamId()),
  );

  protected readonly winChance = computed(() => {
    const game = this.game();
    return game ? estimateWinChance(game.participants, this.allyTeamId()) : null;
  });

  protected readonly queueName = queueName;
  protected readonly rankText = rankText;
  protected readonly mainRank = mainRank;
  protected readonly winRate = winRate;

  constructor() {
    // Carrega ao entrar em partida e limpa ao sair.
    effect((onCleanup) => {
      const state = this.lcu.state();
      const inGame = state.gameflowPhase === 'InProgress' || state.gameflowPhase === 'Reconnect';
      if (inGame && state.summoner) {
        untracked(() => {
          if (!this.game() && !this.loading()) void this.load();
        });
      } else {
        untracked(() => this.reset());
      }
      onCleanup(() => this.clearRetry());
    });
  }

  async load(): Promise<void> {
    const state = this.lcu.state();
    const summoner = state.summoner;
    if (!summoner || !window.riot) return;

    this.clearRetry();
    this.loading.set(true);
    this.error.set(null);
    try {
      this.game.set(
        await window.riot.getLiveGame(summoner.gameName, summoner.tagLine, state.platformId ?? 'BR1'),
      );
    } catch (error) {
      const text = cleanError(error);
      this.error.set(text);
      // A partida pode levar alguns instantes para aparecer na API da Riot.
      if (/não está em partida/.test(text)) {
        this.retryTimer = setTimeout(() => void this.load(), RETRY_MS);
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggle(participant: LiveParticipant): Promise<void> {
    const puuid = participant.puuid;
    if (!puuid) return;
    this.expanded.update((current) => (current === puuid ? null : puuid));
    if (this.expanded() !== puuid || this.recent()[puuid]) return;

    this.setRecent(puuid, 'loading');
    try {
      const platformId = this.lcu.state().platformId ?? 'BR1';
      const matches = await window.riot!.getMatches(puuid, platformId, 0, RECENT_GAMES);
      this.setRecent(puuid, summarize(matches, participant));
    } catch {
      this.setRecent(puuid, 'error');
    }
  }

  protected recentFor(participant: LiveParticipant) {
    return this.recent()[participant.puuid] ?? null;
  }

  protected asSummary(value: RecentSummary | 'loading' | 'error' | null): RecentSummary | null {
    return typeof value === 'object' ? value : null;
  }

  protected startTime(timestamp: number): string {
    return timestamp > 0
      ? new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '—';
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected name(riotId: string): { gameName: string; tag: string } {
    const [gameName, tag] = riotId.split('#');
    return { gameName: gameName || 'Jogador oculto', tag: tag ?? '' };
  }

  private setRecent(puuid: string, value: RecentSummary | 'loading' | 'error'): void {
    this.recent.update((current) => ({ ...current, [puuid]: value }));
  }

  private reset(): void {
    this.clearRetry();
    this.game.set(null);
    this.error.set(null);
    this.expanded.set(null);
    this.recent.set({});
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

function summarize(matches: MatchSummary[], participant: LiveParticipant): RecentSummary {
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let championGames = 0;
  let championWins = 0;
  const results: boolean[] = [];

  for (const match of matches) {
    const p = match.participants.find((x) => x.puuid === participant.puuid);
    if (!p) continue;
    results.push(p.win);
    if (p.win) wins++;
    kills += p.kills;
    deaths += p.deaths;
    assists += p.assists;
    if (p.championId === participant.championId) {
      championGames++;
      if (p.win) championWins++;
    }
  }

  const games = results.length;
  return {
    games,
    wins,
    winRate: games ? Math.round((wins / games) * 100) : 0,
    kda: deaths === 0 ? 'Perfeito' : ((kills + assists) / deaths).toFixed(2),
    championGames,
    championWins,
    results,
  };
}

function cleanError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}
