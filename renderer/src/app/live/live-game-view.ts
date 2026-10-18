import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveGame, LiveParticipant, LocalGame, MatchSummary } from '../history/riot.types';
import { NavigationService } from '../core/navigation.service';
import { LcuService } from '../lcu/lcu.service';
import { mainRank, queueName, rankText, winRate } from '../riot/labels';
import { findEncounters, type PlayerEncounters } from './encounters';
import { estimateWinChance } from './win-chance';
import { ChampionStatsPanel } from '../stats/champion-stats';

const RECENT_GAMES = 10;
/** Quantas partidas suas são cruzadas com os jogadores da partida atual. */
const ENCOUNTER_GAMES = 10;
/**
 * A Riot só libera a partida no spectator 2 a 3 minutos depois do início.
 * Enquanto isso a tela usa os dados locais do jogo e tenta de novo a cada 15 s.
 */
const RETRY_MS = 15_000;

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
  imports: [ChampionStatsPanel],
  templateUrl: './live-game-view.html',
  styleUrl: './live-game-view.scss',
})
export class LiveGameView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly nav = inject(NavigationService);

  protected readonly game = signal<LiveGame | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly recent = signal<Record<string, RecentSummary | 'loading' | 'error'>>({});
  /** A partida veio dos dados locais do jogo; elo e maestria ainda não chegaram da Riot. */
  protected readonly waitingRiot = signal(false);

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

  /** Campeões inimigos, comparados por conteúdo para não recarregar a build a cada atualização. */
  protected readonly enemyIds = computed(() => this.enemies().map((p) => p.championId), {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });

  protected readonly allyIds = computed(() => this.allies().map((p) => p.championId), {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });

  /** Jogadores desta partida que estavam nas suas últimas 10 partidas. */
  protected readonly encounters = signal<PlayerEncounters[] | 'loading' | null>(null);
  /** Por Riot ID, que existe tanto nos dados locais quanto nos da Riot. */
  protected readonly encounterByRiotId = computed(() => {
    const list = this.encounters();
    return new Map(Array.isArray(list) ? list.map((p) => [p.riotId.toLowerCase(), p]) : []);
  });
  protected readonly encounterList = computed(() => {
    const list = this.encounters();
    return Array.isArray(list) ? list : [];
  });

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
    effect(() => {
      const state = this.lcu.state();
      const inGame = state.gameflowPhase === 'InProgress' || state.gameflowPhase === 'Reconnect';
      if (inGame && state.summoner) {
        untracked(() => {
          if (!this.game() && !this.loading()) void this.load();
        });
      } else {
        untracked(() => this.reset());
      }
    });
    inject(DestroyRef).onDestroy(() => this.clearRetry());
  }

  async load(): Promise<void> {
    const state = this.lcu.state();
    const summoner = state.summoner;
    if (!summoner || !window.riot) return;

    const platformId = state.platformId ?? 'BR1';
    this.clearRetry();
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await window.riot.getLiveGame(summoner.gameName, summoner.tagLine, platformId);
      this.game.set(game);
      this.waitingRiot.set(false);
      void this.loadEncounters(game, platformId);
    } catch (error) {
      const text = cleanError(error);
      if (!/não está em partida/.test(text)) {
        if (!this.game()) this.error.set(text);
        return;
      }
      // A Riot ainda não liberou a partida: mostra os times pelos dados do próprio jogo.
      const local = await window.riot.getLocalGame().catch(() => null);
      if (local && local.players.length > 0) {
        const game = this.fromLocal(local);
        if (!this.game() || this.waitingRiot()) this.game.set(game);
        this.waitingRiot.set(true);
        void this.loadEncounters(game, platformId);
      } else if (!this.game()) {
        this.error.set('A partida está carregando. Os times aparecem assim que o jogo abrir.');
      }
      this.retryTimer = setTimeout(() => void this.load(), RETRY_MS);
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

  protected openPlayer(participant: { riotId: string }): void {
    if (participant.riotId) this.nav.openPlayer(participant.riotId, this.lcu.state().platformId);
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

  protected encounterOf(participant: LiveParticipant): PlayerEncounters | null {
    return this.encounterByRiotId().get(participant.riotId.toLowerCase()) ?? null;
  }

  protected kda(p: { kills: number; deaths: number; assists: number }): string {
    return `${p.kills}/${p.deaths}/${p.assists}`;
  }

  protected timeAgo(timestamp: number): string {
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  }

  /** Busca suas últimas 10 partidas e cruza com os jogadores desta. */
  private async loadEncounters(game: LiveGame, platformId: string): Promise<void> {
    const summoner = this.lcu.state().summoner;
    const riotId = summoner ? `${summoner.gameName}#${summoner.tagLine}`.toLowerCase() : null;
    const me = game.participants.find((p) => p.riotId.toLowerCase() === riotId);
    // Uma vez por partida: com os dados locais ou com os da Riot, o que vier primeiro.
    if (!me || !summoner || !window.riot || this.encounters() !== null) return;
    this.encounters.set('loading');
    try {
      // Nos dados locais não há puuid: o seu vem pelo Riot ID.
      const myPuuid = me.puuid || (await window.riot.findPlayer(summoner.gameName, summoner.tagLine, platformId)).puuid;
      const matches = await window.riot.getMatches(myPuuid, platformId, 0, ENCOUNTER_GAMES);
      this.encounters.set(findEncounters(myPuuid, me.riotId, me.teamId, game.participants, matches));
    } catch {
      this.encounters.set(null);
    }
  }

  /** Monta a partida com os dados locais do jogo (sem elo, maestria nem puuid). */
  private fromLocal(local: LocalGame): LiveGame {
    return {
      gameId: 0,
      queueId: local.queueId,
      mapId: 11,
      gameStartTime: local.gameStartTime,
      participants: local.players.map((p) => ({
        puuid: '',
        riotId: p.riotId,
        championId: this.ddragon.championKeyOf(p.championKey),
        teamId: p.team === 'CHAOS' ? 200 : 100,
        summonerSpellIds: p.spellKeys.map((key) => this.ddragon.spellIdOf(key)),
        keystoneId: p.keystoneId,
        subStyleId: p.subStyleId,
        ranked: [],
        mastery: null,
      })),
    };
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
    this.encounters.set(null);
    this.waitingRiot.set(false);
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
