import { Component, computed, inject, signal } from '@angular/core';
import { isStatShard, type ItemBuild, type RunePageSuggestion } from '../builds/builds.types';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { LcuService } from '../lcu/lcu.service';
import { queueName, rankQueueLabel, tierName } from '../riot/labels';
import type { MatchParticipant, MatchSummary, PlayerProfile, RiotSettings } from './riot.types';

const PAGE_SIZE = 10;

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-history-view',
  templateUrl: './history-view.html',
  styleUrl: './history-view.scss',
})
export class HistoryView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);

  protected readonly settings = signal<RiotSettings | null>(null);
  protected readonly riotId = signal('');
  protected readonly platformId = signal('BR1');

  protected readonly player = signal<PlayerProfile | null>(null);
  protected readonly matches = signal<MatchSummary[]>([]);
  protected readonly expandedMatchId = signal<string | null>(null);
  protected readonly loading = signal<'search' | 'more' | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<Feedback | null>(null);

  protected readonly lcuDisconnected = computed(() => this.lcu.state().status !== 'connected');

  protected readonly ownRiotId = computed(() => {
    const summoner = this.lcu.state().summoner;
    return summoner ? `${summoner.gameName}#${summoner.tagLine}` : null;
  });

  constructor() {
    void this.loadSettings();
  }

  protected async changePlatform(platformId: string): Promise<void> {
    this.platformId.set(platformId);
    await window.riot!.setPlatform(platformId);
  }

  protected async searchOwnAccount(): Promise<void> {
    const ownRiotId = this.ownRiotId();
    if (!ownRiotId) return;
    this.riotId.set(ownRiotId);
    const platformId = this.lcu.state().platformId;
    if (platformId) await this.changePlatform(platformId);
    await this.search();
  }

  protected async search(): Promise<void> {
    const [gameName, tagLine] = this.riotId().split('#');
    if (!gameName?.trim() || !tagLine?.trim()) {
      this.feedback.set({ kind: 'error', text: 'Digite o Riot ID no formato Nome#TAG.' });
      return;
    }

    this.loading.set('search');
    this.player.set(null);
    this.matches.set([]);
    this.expandedMatchId.set(null);
    await this.guard(async () => {
      const player = await window.riot!.findPlayer(gameName, tagLine, this.platformId());
      this.player.set(player);
      await this.loadMatches(0);
    });
    this.loading.set(null);
  }

  protected async loadMore(): Promise<void> {
    this.loading.set('more');
    await this.guard(() => this.loadMatches(this.matches().length));
    this.loading.set(null);
  }

  protected toggleMatch(matchId: string): void {
    this.expandedMatchId.update((current) => (current === matchId ? null : matchId));
  }

  protected me(match: MatchSummary): MatchParticipant | null {
    const puuid = this.player()?.puuid;
    return match.participants.find((p) => p.puuid === puuid) ?? null;
  }

  protected team(match: MatchSummary, teamId: number): MatchParticipant[] {
    return match.participants.filter((p) => p.teamId === teamId);
  }

  protected readonly queueName = queueName;
  protected readonly rankLabel = rankQueueLabel;
  protected readonly tierName = tierName;

  protected kda(p: MatchParticipant): string {
    return p.deaths === 0 ? 'Perfeito' : ((p.kills + p.assists) / p.deaths).toFixed(2);
  }

  protected csPerMinute(p: MatchParticipant, match: MatchSummary): string {
    return (p.cs / (match.gameDurationSeconds / 60)).toFixed(1);
  }

  protected duration(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  protected timeAgo(timestamp: number): string {
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  }

  /** Copia runas, feitiços e itens finais de um jogador da partida para o cliente. */
  protected async importBuild(match: MatchSummary, participant: MatchParticipant): Promise<void> {
    const champion = this.ddragon.champion(participant.championId);
    const championName = champion?.name ?? 'Campeão';
    const playerName = participant.riotId.split('#')[0];
    const key = `${match.matchId}:${participant.puuid}`;

    this.busyKey.set(key);
    await this.guard(async () => {
      const inChampSelect = this.lcu.state().gameflowPhase === 'ChampSelect';
      const runes = await window.builds!.applyRunes(
        toRunePage(match, participant, (id) => this.ddragon.runeName(id)),
        `${championName} ${playerName}`,
        inChampSelect,
      );
      const itemSet = await window.builds!.applyItems(
        participant.championId,
        toItemBuild(match, participant, `${championName} de ${playerName}`, (id) =>
          this.ddragon.baseItemId(id),
        ),
      );
      this.feedback.set({
        kind: 'success',
        text: `Runas em "${runes.pageName}"${runes.spellsApplied ? ' + feitiços' : ''} e itens em "${itemSet}".`,
      });
    });
    this.busyKey.set(null);
  }

  private async loadMatches(start: number): Promise<void> {
    const player = this.player();
    if (!player) return;
    const page = await window.riot!.getMatches(player.puuid, player.platformId, start, PAGE_SIZE);
    this.matches.update((current) => [...current, ...page]);
    this.hasMore.set(page.length === PAGE_SIZE);
  }

  private async loadSettings(): Promise<void> {
    if (!window.riot) return;
    const settings = await window.riot.getSettings();
    this.settings.set(settings);
    this.platformId.set(settings.platformId);
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    this.feedback.set(null);
    try {
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.feedback.set({
        kind: 'error',
        text: text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''),
      });
    }
  }
}

function toRunePage(
  match: MatchSummary,
  p: MatchParticipant,
  runeName: (id: number) => string,
): RunePageSuggestion {
  const ids = [...p.perks.selections, ...p.perks.statPerks];
  const keystoneId = p.perks.selections[0];
  return {
    recommendationId: `${match.matchId}:${p.puuid}`,
    keystone: { id: keystoneId, name: runeName(keystoneId), styleId: p.perks.primaryStyleId },
    primaryStyleId: p.perks.primaryStyleId,
    secondaryStyleId: p.perks.subStyleId,
    perks: ids.map((id, index) => ({
      id,
      name: runeName(id),
      styleId: isStatShard(id) ? 0 : index < 4 ? p.perks.primaryStyleId : p.perks.subStyleId,
    })),
    summonerSpellIds: p.summonerSpellIds,
  };
}

function toItemBuild(
  match: MatchSummary,
  p: MatchParticipant,
  title: string,
  baseItemId: (id: number) => number,
): ItemBuild {
  const finalItems = p.items.slice(0, 6).filter((id) => id > 0).map(baseItemId);
  const trinket = p.items[6] > 0 ? [baseItemId(p.items[6])] : [];
  return {
    file: `${match.matchId}-${p.puuid}`,
    championId: p.championId,
    position: p.position || null,
    title,
    maps: [match.mapId],
    blocks: [
      { name: 'Build da partida', items: finalItems },
      ...(trinket.length ? [{ name: 'Trinket', items: trinket }] : []),
    ],
  };
}
