import { Component, computed, inject } from '@angular/core';
import { BuildPanel } from '../builds/build-panel';
import { ChampSelectPanel } from '../champ-select/champ-select-panel';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { LcuService } from '../lcu/lcu.service';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-champ-select-view',
  imports: [ChampSelectPanel, BuildPanel, ChampionStatsPanel, Icon],
  template: `
    @if (state().champSelect; as session) {
      <div class="layout">
        <section class="card">
          <h3 class="section-title">Seu campeão</h3>
          <app-champ-select-panel [session]="session" />
        </section>
        <section class="card">
          <h3 class="section-title">Build recomendada</h3>
          @if (championId() > 0) {
            <div class="stats-block">
              <app-champion-stats [championId]="championId()" [position]="session.assignedPosition || null" />
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
  protected readonly championId = computed(() => {
    const session = this.state().champSelect;
    return session ? session.championId || session.pickIntentChampionId : 0;
  });
}
