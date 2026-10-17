import { Component, computed, inject, input } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { MatchParticipant, MatchSummary, PlayerProfile } from './riot.types';

const POSITION_LABELS: Record<string, string> = {
  top: 'Topo',
  jungle: 'Selva',
  middle: 'Meio',
  bottom: 'Atirador',
  utility: 'Suporte',
};

interface ChampionLine {
  championId: number;
  games: number;
  wins: number;
  kda: string;
  winRate: number;
}

/** Resumo do jogador a partir das partidas carregadas no histórico. */
@Component({
  selector: 'app-player-summary',
  templateUrl: './player-summary.html',
  styleUrl: './player-summary.scss',
})
export class PlayerSummary {
  readonly player = input.required<PlayerProfile>();
  readonly matches = input.required<MatchSummary[]>();

  protected readonly ddragon = inject(DataDragonService);

  /** Partidas do jogador, da mais recente para a mais antiga. */
  private readonly games = computed(() => {
    const puuid = this.player().puuid;
    return this.matches()
      .map((match) => ({ match, me: match.participants.find((p) => p.puuid === puuid) }))
      .filter((row): row is { match: MatchSummary; me: MatchParticipant } => !!row.me);
  });

  protected readonly overview = computed(() => {
    const rows = this.games();
    if (rows.length === 0) return null;
    const wins = rows.filter((r) => r.me.win).length;
    const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);

    const kills = sum((r) => r.me.kills);
    const deaths = sum((r) => r.me.deaths);
    const assists = sum((r) => r.me.assists);
    const minutes = sum((r) => r.match.gameDurationSeconds / 60);
    const participation =
      sum((r) => {
        const teamKills = r.match.participants
          .filter((p) => p.teamId === r.me.teamId)
          .reduce((total, p) => total + p.kills, 0);
        return teamKills ? (r.me.kills + r.me.assists) / teamKills : 0;
      }) / rows.length;

    // Sequência atual: partidas seguidas com o mesmo resultado da mais recente.
    let streak = 0;
    for (const row of rows) {
      if (row.me.win !== rows[0].me.win) break;
      streak++;
    }

    return {
      games: rows.length,
      wins,
      winRate: Math.round((wins / rows.length) * 100),
      kills: (kills / rows.length).toFixed(1),
      deaths: (deaths / rows.length).toFixed(1),
      assists: (assists / rows.length).toFixed(1),
      kda: deaths === 0 ? 'Perfeito' : ((kills + assists) / deaths).toFixed(2),
      csPerMinute: minutes ? (sum((r) => r.me.cs) / minutes).toFixed(1) : '0',
      participation: Math.round(participation * 100),
      vision: (sum((r) => r.me.visionScore) / rows.length).toFixed(0),
      streak: { count: streak, win: rows[0].me.win },
      results: rows.slice(0, 20).map((r) => r.me.win),
    };
  });

  protected readonly champions = computed<ChampionLine[]>(() => {
    const byChampion = new Map<number, { games: number; wins: number; k: number; d: number; a: number }>();
    for (const { me } of this.games()) {
      const line = byChampion.get(me.championId) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
      line.games++;
      if (me.win) line.wins++;
      line.k += me.kills;
      line.d += me.deaths;
      line.a += me.assists;
      byChampion.set(me.championId, line);
    }
    return [...byChampion.entries()]
      .map(([championId, l]) => ({
        championId,
        games: l.games,
        wins: l.wins,
        winRate: Math.round((l.wins / l.games) * 100),
        kda: l.d === 0 ? 'Perfeito' : ((l.k + l.a) / l.d).toFixed(2),
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
      .slice(0, 5);
  });

  protected readonly positions = computed(() => {
    const byPosition = new Map<string, { games: number; wins: number }>();
    for (const { me } of this.games()) {
      if (!me.position) continue;
      const line = byPosition.get(me.position) ?? { games: 0, wins: 0 };
      line.games++;
      if (me.win) line.wins++;
      byPosition.set(me.position, line);
    }
    const total = [...byPosition.values()].reduce((sum, l) => sum + l.games, 0);
    return Object.keys(POSITION_LABELS)
      .filter((position) => byPosition.has(position))
      .map((position) => {
        const line = byPosition.get(position)!;
        return {
          label: POSITION_LABELS[position],
          games: line.games,
          share: Math.round((line.games / total) * 100),
          winRate: Math.round((line.wins / line.games) * 100),
        };
      })
      .sort((a, b) => b.games - a.games);
  });

  /** Servidores antigos não mandam a maestria. */
  protected readonly mastery = computed(() => this.player().topMastery ?? []);

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected name(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? '—';
  }

  protected points(value: number): string {
    return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1000)}k`;
  }
}
