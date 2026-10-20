import { Component, computed, inject } from '@angular/core';
import { BuildPanel } from '../builds/build-panel';
import { ChampSelectPanel } from '../champ-select/champ-select-panel';
import { CounterPanel } from '../champ-select/counter-panel';
import { TeamCompPanel } from '../champ-select/team-comp';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { LcuService } from '../lcu/lcu.service';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-champ-select-view',
  imports: [ChampSelectPanel, CounterPanel, TeamCompPanel, BuildPanel, ChampionStatsPanel, Icon],
  template: `
    @if (state().champSelect; as session) {
      <div class="layout">
        <section class="card left-col">
          <h3 class="section-title">Seu campeão</h3>
          <app-champ-select-panel [session]="session" />

          <div class="counter-block">
            <h3 class="section-title">Composição</h3>
            <app-team-comp
              [allyChampionIds]="allyIds()"
              [enemyChampionIds]="enemyIds()"
              [canPick]="!session.championId"
            />
          </div>

          <div class="counter-block">
            <h3 class="section-title">Counters</h3>
            <app-counter-panel
              [enemyChampionIds]="enemyIds()"
              [assignedPosition]="session.assignedPosition"
            />
          </div>
        </section>
        <section class="card">
          <h3 class="section-title">Build recomendada</h3>
          @if (championId() > 0) {
            <div class="stats-block">
              <app-champion-stats
                [championId]="championId()"
                [position]="session.assignedPosition || null"
                [enemyIds]="enemyIds()"
              />
            </div>
            <app-build-panel [championId]="championId()" [position]="session.assignedPosition" [inChampSelect]="true" />
          } @else {
            <p class="muted">Escolha um campeão para ver runas e itens.</p>
          }
        </section>
      </div>
    } @else {
      <section class="card">
        <div class="empty-state">
          <app-icon name="swords" [size]="36" />
          <h2>Você não está na seleção de campeões</h2>
          <p>
            Entre numa fila. Quando a seleção começar, esta tela abre sozinha com seu campeão,
            o banco do ARAM, trocas com aliados e a build para importar.
          </p>
        </div>
      </section>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: 18px;
      align-items: start;
    }
    .left-col {
      display: grid;
      gap: 18px;
    }
    .counter-block {
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .stats-block {
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    @media (max-width: 1200px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ChampSelectView {
  private readonly lcu = inject(LcuService);
  protected readonly state = this.lcu.state;
  /** Igualdade por conteúdo: o estado do cliente chega a cada evento, mas os inimigos mudam pouco. */
  protected readonly enemyIds = computed(() => this.state().champSelect?.enemyChampionIds ?? [], {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });

  /** Seu time com a sua intenção de escolha, enquanto você não confirma. */
  protected readonly allyIds = computed(
    () => {
      const session = this.state().champSelect;
      if (!session) return [];
      return session.team.map((m) => (m.isMe ? m.championId || session.championId || session.pickIntentChampionId : m.championId));
    },
    { equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) },
  );

  protected readonly championId = computed(() => {
    const session = this.state().champSelect;
    return session ? session.championId || session.pickIntentChampionId : 0;
  });
}
