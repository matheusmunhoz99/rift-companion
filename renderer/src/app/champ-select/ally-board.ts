import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PlayerProfile } from '../history/riot.types';
import { LcuService } from '../lcu/lcu.service';
import type { TeamMember } from '../lcu/lcu.types';
import { NavigationService } from '../core/navigation.service';
import { mainRank, rankText, winRate } from '../riot/labels';
import { statsPositionLabel } from '../stats/stats.types';

/** Maestria abaixo disso no campeão escolhido conta como "pouca experiência". */
const LOW_MASTERY_POINTS = 8_000;

type Profile = PlayerProfile | 'loading' | 'hidden' | 'error';

interface AllyCard {
  member: TeamMember;
  /** Campeão que importa agora: o confirmado, senão o que ele está mirando. */
  championId: number;
  profile: Profile;
}

/**
 * Cards dos aliados na seleção: elo, vitórias da temporada, campeões mais jogados
 * e um aviso quando o aliado tem pouca experiência no campeão que pegou. Usa a mesma
 * busca de jogador dos cards da partida ao vivo; a Riot esconde nomes em algumas filas.
 */
@Component({
  selector: 'app-ally-board',
  template: `
    @if (hiddenNames()) {
      <p class="muted note">A Riot esconde os nomes dos jogadores nesta fila. Os cards aparecem quando a partida começar.</p>
    }
    <div class="allies">
      @for (card of cards(); track card.member.cellId) {
        <article class="ally" [class.me]="card.member.isMe">
          @if (iconUrl(card.championId); as icon) {
            <img class="champ" [src]="icon" [alt]="ddragon.champion(card.championId)?.name ?? ''" />
          } @else {
            <span class="champ placeholder" aria-hidden="true"></span>
          }

          <div class="main">
            <div class="top">
              @if (lane(card.member.assignedPosition); as lane) {
                <span class="lane">{{ lane }}</span>
              }
              @if (card.member.isMe) {
                <span class="nick">Você</span>
              } @else if (asProfile(card.profile); as p) {
                <button type="button" class="nick link" (click)="open(card.member.riotId)">
                  {{ p.gameName }}<span class="muted">#{{ p.tagLine }}</span>
                </button>
              } @else {
                <span class="nick muted">{{ card.member.name ?? 'Jogador oculto' }}</span>
              }
              @if (firstTime(card); as warn) {
                <span class="badge warn" [title]="warn.title">{{ warn.label }}</span>
              }
            </div>

            @if (card.member.isMe) {
              <span class="muted small">Este é você.</span>
            } @else {
            @switch (card.profile) {
              @case ('loading') {
                <span class="muted small">Carregando elo e histórico…</span>
              }
              @case ('hidden') {
                <span class="muted small">Nome oculto nesta fila.</span>
              }
              @case ('error') {
                <span class="muted small">Não foi possível carregar este jogador.</span>
              }
              @default {
                @if (asProfile(card.profile); as p) {
                  <div class="stats">
                    @if (mainRank(p.ranked); as rank) {
                      <span class="rank">{{ rankText(rank) }}</span>
                      <span class="wl muted">
                        {{ rank.wins }}V {{ rank.losses }}D
                        @if (winRate(rank.wins, rank.losses); as rate) {
                          · <strong [class.good]="rate >= 53" [class.bad]="rate < 47">{{ rate }}%</strong>
                        }
                      </span>
                    } @else {
                      <span class="muted">Sem elo na Solo/Duo</span>
                    }
                    <span class="champs">
                      @for (m of topChampions(p); track m.championId) {
                        @if (iconUrl(m.championId); as icon) {
                          <img [src]="icon" [alt]="ddragon.champion(m.championId)?.name ?? ''" [title]="ddragon.champion(m.championId)?.name + ' · ' + (m.points / 1000).toFixed(0) + 'k'" />
                        }
                      }
                    </span>
                  </div>
                }
              }
            }
            }
          </div>
        </article>
      }
    </div>
  `,
  styleUrl: './ally-board.scss',
})
export class AllyBoard {
  readonly allies = input.required<TeamMember[]>();

  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly nav = inject(NavigationService);

  protected readonly mainRank = mainRank;
  protected readonly rankText = rankText;
  protected readonly winRate = winRate;

  /** Rótulo da rota (Topo, Selva…); null quando a fila não define rota (ex.: escolha às cegas). */
  protected lane(position: string): string | null {
    const label = statsPositionLabel(position.toUpperCase());
    return label === '—' ? null : label;
  }

  /** Perfil buscado por Riot ID (minúsculo); carregado uma vez por partida. */
  private readonly profiles = signal<Map<string, Profile>>(new Map());
  private requested = new Set<string>();

  protected readonly cards = computed<AllyCard[]>(() => {
    const profiles = this.profiles();
    return this.allies().map((member) => {
      const championId = member.championId || member.hoverChampionId || 0;
      const key = member.riotId?.toLowerCase();
      const profile: Profile = member.isMe || !key ? 'hidden' : (profiles.get(key) ?? 'loading');
      return { member, championId, profile };
    });
  });

  protected readonly hiddenNames = computed(
    () => this.allies().some((m) => !m.isMe && !m.riotId),
  );

  constructor() {
    // Busca o perfil de cada aliado assim que o Riot ID aparece (uma vez por jogador).
    effect(() => {
      for (const member of this.allies()) {
        if (!member.isMe && member.riotId) this.request(member.riotId);
      }
    });
  }

  protected asProfile(profile: Profile): PlayerProfile | null {
    return typeof profile === 'object' ? profile : null;
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected topChampions(profile: PlayerProfile) {
    return [...profile.topMastery].sort((a, b) => b.points - a.points).slice(0, 3);
  }

  /** Aviso de pouca experiência: o campeão escolhido não está entre os de maior maestria. */
  protected firstTime(card: AllyCard): { label: string; title: string } | null {
    const profile = this.asProfile(card.profile);
    if (!profile || card.championId <= 0 || card.member.isMe) return null;
    const mastery = profile.topMastery.find((m) => m.championId === card.championId);
    const name = this.ddragon.champion(card.championId)?.name ?? 'esse campeão';
    if (!mastery) return { label: 'Pouca experiência', title: `Fora dos campeões de maior maestria de ${profile.gameName} — pode ser a 1ª vez de ${name}.` };
    if (mastery.points < LOW_MASTERY_POINTS) return { label: `Maestria ${mastery.level}`, title: `${(mastery.points / 1000).toFixed(1)}k de maestria em ${name} — pouca experiência.` };
    return null;
  }

  protected open(riotId: string | null | undefined): void {
    if (riotId) this.nav.openPlayer(riotId, this.lcu.state().platformId);
  }

  private request(riotId: string): void {
    const key = riotId.toLowerCase();
    if (this.requested.has(key)) return;
    this.requested.add(key);
    const [gameName, tagLine] = riotId.split('#');
    if (!gameName || !tagLine || !window.riot) {
      this.setProfile(key, 'hidden');
      return;
    }
    const platformId = this.lcu.state().platformId ?? 'BR1';
    window.riot.findPlayer(gameName, tagLine, platformId).then(
      (profile) => this.setProfile(key, profile),
      () => this.setProfile(key, 'error'),
    );
  }

  private setProfile(key: string, profile: Profile): void {
    this.profiles.update((map) => new Map(map).set(key, profile));
  }
}
