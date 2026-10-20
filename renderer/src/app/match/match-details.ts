import { Component, computed, inject, input, output } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { MatchParticipant, MatchSummary } from '../history/riot.types';
import { positionOrder } from '../stats/match-context';
import { statsPositionLabel } from '../stats/stats.types';
import { partiesOf, type PartyInfo } from './parties';

interface PlayerLine {
  player: MatchParticipant;
  party: PartyInfo | null;
  lane: string | null;
  kda: string;
  /** Participação em abates do time (0 a 100). */
  killShare: number;
  /** Fatia do dano do time e largura da barra (relativa ao maior dano da partida). */
  damageShare: number;
  damageBar: number;
  topDamage: boolean;
  csPerMinute: string;
}

interface TeamBlock {
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  damage: number;
  lines: PlayerLine[];
}

/**
 * Placar completo de uma partida terminada: os dois times com rota, grupo,
 * KDA, participação, dano proporcional, ouro, CS, visão e itens.
 * Usado no histórico e na partida ao vivo (partidas com quem já jogou com você).
 */
@Component({
  selector: 'app-match-details',
  templateUrl: './match-details.html',
  styleUrl: './match-details.scss',
})
export class MatchDetails {
  protected readonly ddragon = inject(DataDragonService);

  readonly match = input.required<MatchSummary>();
  /** Jogador em destaque (o dono do histórico). */
  readonly focusPuuid = input<string | null>(null);
  /** Outro jogador para destacar (ex.: quem já jogou com você). */
  readonly markPuuid = input<string | null>(null);
  /** Outras partidas da lista, para estimar grupos quando não foram vistos ao vivo. */
  readonly context = input<MatchSummary[]>([]);
  readonly showImport = input(false);
  readonly importDisabled = input(false);
  readonly importBusy = input<string | null>(null);

  readonly openPlayer = output<MatchParticipant>();
  readonly importBuild = output<MatchParticipant>();

  private readonly minutes = computed(() => Math.max(this.match().gameDurationSeconds / 60, 1));

  protected readonly teams = computed<TeamBlock[]>(() => {
    const match = this.match();
    const parties = partiesOf(match, this.context());
    const maxDamage = Math.max(1, ...match.participants.map((p) => p.damageToChampions));
    const topDamage = match.participants.reduce((best, p) => (p.damageToChampions > best.damageToChampions ? p : best));
    const focusTeam = match.participants.find((p) => p.puuid === this.focusPuuid())?.teamId ?? 100;

    const blocks = [100, 200].map((teamId) => {
      const players = match.participants
        .filter((p) => p.teamId === teamId)
        .sort((a, b) => positionOrder(a.position || null) - positionOrder(b.position || null));
      const kills = sum(players, (p) => p.kills);
      const damage = sum(players, (p) => p.damageToChampions);
      return {
        teamId,
        win: players[0]?.win ?? false,
        kills,
        deaths: sum(players, (p) => p.deaths),
        assists: sum(players, (p) => p.assists),
        gold: sum(players, (p) => p.gold),
        damage,
        lines: players.map((player) => ({
          player,
          party: parties.get(player.riotId.toLowerCase()) ?? null,
          // Partidas sem rotas (Partida Rápida antiga, ARAM) vêm com "" ou "Invalid".
          lane: positionOrder(player.position || null) < 5 ? statsPositionLabel(player.position) : null,
          kda: player.deaths === 0 ? 'Perfeito' : ((player.kills + player.assists) / player.deaths).toFixed(2),
          killShare: kills ? Math.round(((player.kills + player.assists) / kills) * 100) : 0,
          damageShare: damage ? Math.round((player.damageToChampions / damage) * 100) : 0,
          damageBar: (player.damageToChampions / maxDamage) * 100,
          topDamage: player === topDamage,
          csPerMinute: (player.cs / this.minutes()).toFixed(1),
        })),
      };
    });
    // O time de quem está em destaque vem primeiro.
    return focusTeam === 200 ? blocks.reverse() : blocks;
  });

  protected readonly confirmedParties = computed(() => this.teams().some((t) => t.lines.some((l) => l.party?.confirmed)));
  protected readonly estimatedParties = computed(() => this.teams().some((t) => t.lines.some((l) => l.party && !l.party.confirmed)));

  protected name(riotId: string): { gameName: string; tag: string } {
    const [gameName, tag] = riotId.split('#');
    return { gameName: gameName || 'Jogador oculto', tag: tag ?? '' };
  }

  protected thousands(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  }

  protected kdaClass(kda: string): string {
    if (kda === 'Perfeito') return 'great';
    const value = Number(kda);
    return value >= 5 ? 'great' : value >= 3 ? 'good' : value < 1.5 ? 'bad' : '';
  }
}

function sum(players: MatchParticipant[], pick: (p: MatchParticipant) => number): number {
  return players.reduce((total, p) => total + pick(p), 0);
}
