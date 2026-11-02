import { Component, computed, inject, input, output } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PostGame, PostGamePlayer } from '../history/riot.types';
import type { PartyInfo } from '../match/parties';
import { Icon } from '../ui/icon';

/** Seis itens + sentinela. */
const ITEM_SLOTS = 7;

interface TeamBoard {
  teamId: number;
  ally: boolean;
  won: boolean | null;
  kills: number;
  gold: number;
  players: PostGamePlayer[];
}

/**
 * Placar do fim de jogo, os dois times lado a lado: campeão e nível, Duo/Trio, feitiços,
 * KDA, CS, dano (com barra), ouro, itens e a nota. É o que a pessoa procura primeiro
 * depois da partida: a composição do outro time, quem estava junto e o que cada um montou.
 */
@Component({
  selector: 'app-postgame-scoreboard',
  imports: [Icon],
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.scss',
})
export class PostGameScoreboard {
  readonly game = input.required<PostGame>();
  /** Grupo de cada jogador, por Riot ID minúsculo (vistos ao vivo ou estimados). */
  readonly parties = input<Map<string, PartyInfo>>(new Map());
  readonly openPlayer = output<PostGamePlayer>();

  protected readonly ddragon = inject(DataDragonService);

  /** Seu time primeiro; cada time com o resultado e os totais. */
  protected readonly teams = computed<TeamBoard[]>(() => {
    const game = this.game();
    const myTeam = game.players.find((p) => p.isMe)?.teamId ?? 100;
    // Todos os times da partida, o seu primeiro (na Arena são várias duplas).
    const ids = [myTeam, ...new Set(game.players.map((p) => p.teamId).filter((id) => id !== myTeam))];
    return ids
      .map((teamId) => {
        const players = game.players.filter((p) => p.teamId === teamId);
        return {
          teamId,
          ally: teamId === myTeam,
          won: players[0]?.win ?? null,
          kills: players.reduce((sum, p) => sum + p.kills, 0),
          gold: players.reduce((sum, p) => sum + p.gold, 0),
          players,
        };
      })
      .filter((team) => team.players.length > 0);
  });

  /** Maior dano da partida: a barra de cada um é relativa a ele. */
  private readonly maxDamage = computed(() => Math.max(1, ...this.game().players.map((p) => p.damageToChampions)));

  protected damageWidth(p: PostGamePlayer): number {
    return Math.max(3, Math.round((p.damageToChampions / this.maxDamage()) * 100));
  }

  protected partyOf(p: PostGamePlayer): PartyInfo | null {
    return (p.riotId && this.parties().get(p.riotId.toLowerCase())) || null;
  }

  protected partyTitle(party: PartyInfo): string {
    return party.confirmed
      ? `${party.label}: entraram juntos na fila (visto durante a partida).`
      : `${party.label} estimado: já entraram juntos em outras partidas.`;
  }

  /** Itens na ordem do placar, completando os espaços vazios. */
  protected slots(p: PostGamePlayer): Array<number | null> {
    const items: Array<number | null> = p.items.slice(0, ITEM_SLOTS);
    while (items.length < ITEM_SLOTS) items.push(null);
    return items;
  }

  protected icon(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected championName(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? '';
  }

  protected name(riotId: string): string {
    return riotId.split('#')[0] || 'Jogador';
  }

  protected kdaRatio(p: PostGamePlayer): string {
    return p.deaths === 0 ? 'Perfeito' : ((p.kills + p.assists) / p.deaths).toFixed(2);
  }

  protected perMinute(value: number): string {
    return (value / Math.max(1, this.game().durationSeconds / 60)).toFixed(1);
  }

  protected thousands(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }

  /** Mesma régua de cor da nota no resto da tela. */
  protected scoreTone(score: number): string {
    return score >= 8 ? 'high' : score >= 6 ? 'mid' : 'low';
  }
}
