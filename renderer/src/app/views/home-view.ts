import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { InvisibleStatus } from '../core/app.types';
import { NavigationService } from '../core/navigation.service';
import { PreferencesService } from '../core/preferences.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { MatchParticipant, MatchSummary, PlayerProfile } from '../history/riot.types';
import { LcuService } from '../lcu/lcu.service';
import { queueName, rankQueueLabel, rankText, winRate } from '../riot/labels';
import { Icon } from '../ui/icon';
import { Switch } from '../ui/switch';
import { ToastService, errorText } from '../core/toast.service';

const INVISIBLE_LABELS: Record<InvisibleStatus, string> = { offline: 'offline', mobile: 'celular', online: 'online' };

const PHASE_LABELS: Record<string, string> = {
  None: 'No menu principal',
  Lobby: 'No lobby',
  Matchmaking: 'Procurando partida',
  ReadyCheck: 'Partida encontrada',
  ChampSelect: 'Seleção de campeões',
  GameStart: 'Carregando partida',
  InProgress: 'Em partida',
  Reconnect: 'Reconectar à partida',
  WaitingForStats: 'Aguardando estatísticas',
  PreEndOfGame: 'Fim de jogo',
  EndOfGame: 'Fim de jogo',
};

const RECENT_COUNT = 6;

interface RecentRow {
  match: MatchSummary;
  me: MatchParticipant;
}

@Component({
  selector: 'app-home-view',
  imports: [Icon, Switch],
  templateUrl: './home-view.html',
  styleUrl: './home-view.scss',
})
export class HomeView {
  protected readonly nav = inject(NavigationService);

  private readonly lcu = inject(LcuService);
  private readonly toast = inject(ToastService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly ddragon = inject(DataDragonService);

  protected readonly state = this.lcu.state;
  protected readonly profile = signal<PlayerProfile | null>(null);
  protected readonly recent = signal<RecentRow[] | null>(null);
  protected readonly profileError = signal<string | null>(null);
  protected readonly openingLeague = signal(false);

  protected readonly phaseLabel = computed(() => {
    const phase = this.state().gameflowPhase;
    return phase ? (PHASE_LABELS[phase] ?? phase) : '—';
  });

  protected readonly recentStats = computed(() => {
    const rows = this.recent();
    if (!rows || rows.length === 0) return null;
    const wins = rows.filter((row) => row.me.win).length;
    const kills = rows.reduce((sum, row) => sum + row.me.kills, 0);
    const deaths = rows.reduce((sum, row) => sum + row.me.deaths, 0);
    const assists = rows.reduce((sum, row) => sum + row.me.assists, 0);
    return {
      games: rows.length,
      wins,
      winRate: Math.round((wins / rows.length) * 100),
      kda: deaths === 0 ? 'Perfeito' : ((kills + assists) / deaths).toFixed(2),
    };
  });

  protected readonly queueName = queueName;
  protected readonly rankLabel = rankQueueLabel;
  protected readonly rankText = rankText;
  protected readonly winRate = winRate;

  private loadedFor: string | null = null;

  constructor() {
    // Recarrega o perfil quando a conta logada muda.
    effect(() => {
      const summoner = this.state().summoner;
      const key = summoner ? `${summoner.gameName}#${summoner.tagLine}` : null;
      untracked(() => {
        if (key === this.loadedFor) return;
        this.loadedFor = key;
        this.profile.set(null);
        this.recent.set(null);
        if (key) void this.loadProfile();
      });
    });
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected timeAgo(timestamp: number): string {
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  }

  protected kda(p: MatchParticipant): string {
    return p.deaths === 0 ? 'Perfeito' : ((p.kills + p.assists) / p.deaths).toFixed(1);
  }

  protected async openLeague(): Promise<void> {
    if (!window.app || this.openingLeague()) return;
    this.openingLeague.set(true);
    try {
      const result = await window.app.launchLeague();
      if (result === 'declined') return;
      const message =
        result === 'restarted'
          ? 'Reiniciando o LoL em modo invisível…'
          : result === 'waiting'
            ? 'O LoL reinicia invisível quando a partida acabar.'
          : result === 'restart-required'
          ? 'Feche o Riot Client por completo e tente novamente para entrar invisível.'
          : result === 'already-open'
            ? 'O LoL já está abrindo.'
            : result
              ? this.prefs.preferences().appearOffline
                ? `Abrindo o LoL em modo invisível (${INVISIBLE_LABELS[this.prefs.preferences().invisibleStatus]})…`
                : 'Abrindo o LoL…'
              : 'Não encontrei o Riot Client neste PC.';
      this.toast.show(message, result && result !== 'restart-required' ? 'success' : 'error');
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    } finally {
      this.openingLeague.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    const state = this.state();
    const summoner = state.summoner;
    if (!summoner || !window.riot) return;
    this.profileError.set(null);
    try {
      const platformId = state.platformId ?? 'BR1';
      const profile = await window.riot.findPlayer(summoner.gameName, summoner.tagLine, platformId);
      this.profile.set(profile);
      const matches = await window.riot.getMatches(profile.puuid, platformId, 0, RECENT_COUNT);
      this.recent.set(
        matches
          .map((match) => ({ match, me: match.participants.find((p) => p.puuid === profile.puuid)! }))
          .filter((row) => !!row.me),
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.profileError.set(text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''));
    }
  }
}
