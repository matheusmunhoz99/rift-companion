import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BuildPanel } from '../builds/build-panel';
import { ChampSelectPanel } from '../champ-select/champ-select-panel';
import { CounterPanel } from '../champ-select/counter-panel';
import { DraftBoard } from '../champ-select/draft-board';
import { TeamCompPanel } from '../champ-select/team-comp';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { LcuService } from '../lcu/lcu.service';
import { Icon } from '../ui/icon';

type Tab = 'pick' | 'build' | 'stats' | 'counters' | 'comp';

@Component({
  selector: 'app-champ-select-view',
  imports: [ChampSelectPanel, CounterPanel, DraftBoard, TeamCompPanel, BuildPanel, ChampionStatsPanel, Icon],
  template: `
    @if (state().champSelect; as session) {
      <app-draft-board [session]="session">
        <!-- Painel do meio: uma aba por assunto, para tudo caber sem rolar a página. -->
        <nav class="tabs" role="tablist">
          @for (t of tabs(); track t.key) {
            <button
              type="button"
              role="tab"
              class="tab"
              [class.active]="tab() === t.key"
              [class.alert]="t.key === 'pick' && needsAction()"
              [attr.aria-selected]="tab() === t.key"
              (click)="tab.set(t.key)"
            >
              {{ t.label }}
            </button>
          }
        </nav>
        <div class="tab-body">
          @switch (tab()) {
            @case ('pick') {
              <app-champ-select-panel [session]="session" />
            }
            @case ('build') {
              @if (championId() > 0) {
                <app-build-panel [championId]="championId()" [position]="session.assignedPosition" [inChampSelect]="true" />
              } @else {
                <p class="muted empty">Escolha um campeão para ver runas e itens.</p>
              }
            }
            @case ('stats') {
              @if (championId() > 0) {
                <app-champion-stats
                  [championId]="championId()"
                  [position]="session.assignedPosition || null"
                  [enemyIds]="enemyIds()"
                />
              } @else {
                <p class="muted empty">Escolha um campeão para ver vitórias, escolhas e o oponente de rota.</p>
              }
            }
            @case ('counters') {
              <app-counter-panel [enemyChampionIds]="enemyIds()" [assignedPosition]="session.assignedPosition" />
            }
            @case ('comp') {
              <app-team-comp [allyChampionIds]="allyIds()" [enemyChampionIds]="enemyIds()" [canPick]="!session.championId" />
            }
          }
        </div>
      </app-draft-board>
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
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .tabs {
      display: flex;
      gap: 2px;
      padding: 6px 6px 0;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tab {
      position: relative;
      flex: none;
      padding: 9px 14px 10px;
      border: 0;
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
    }
    .tab:hover {
      color: var(--text);
      background: var(--highlight);
    }
    .tab.active {
      color: var(--text);
    }
    .tab.active::after {
      content: '';
      position: absolute;
      inset: auto 10px -1px;
      height: 2px;
      border-radius: 2px;
      background: var(--accent);
    }
    /* Sua vez e você está em outra aba: um ponto chama para a escolha. */
    .tab.alert::before {
      content: '';
      position: absolute;
      top: 8px;
      right: 5px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
    }
    .tab-body {
      flex: 1;
      min-height: 0;
      padding: 14px 16px 16px;
      overflow-y: auto;
      scrollbar-gutter: stable;
    }
    .empty {
      margin: 0;
    }
  `,
})
export class ChampSelectView {
  private readonly lcu = inject(LcuService);
  protected readonly state = this.lcu.state;
  // Aba inicial pelo hash (#...&tab=stats), usada na revisão visual e nos prints do site.
  private readonly initialTab = (/[#&]tab=(pick|build|stats|counters|comp)/.exec(location.hash)?.[1] ?? null) as Tab | null;
  protected readonly tab = signal<Tab>(this.initialTab ?? 'pick');

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

  /** Escolher, banir ou usar o banco/rolar: o que só a aba "Escolher" faz. */
  protected readonly needsAction = computed(() => {
    const session = this.state().champSelect;
    return !!session && (session.pickActionId !== null || session.banActionId != null);
  });

  protected readonly tabs = computed(() => {
    const session = this.state().champSelect;
    const aram = !!session?.benchEnabled;
    const list: Array<{ key: Tab; label: string }> = [
      { key: 'pick', label: aram ? 'Campeão e banco' : 'Escolher' },
      { key: 'build', label: 'Build' },
      { key: 'stats', label: 'Estatísticas' },
    ];
    // Counters de rota não fazem sentido no ARAM; a composição vale em todos os modos.
    if (!aram) list.push({ key: 'counters', label: 'Counters' });
    list.push({ key: 'comp', label: 'Composição' });
    return list;
  });

  constructor() {
    // Sua vez de escolher ou banir: volta para a aba de escolha. Depois de confirmar
    // o campeão, vai para a build (o que mais se usa até a partida começar).
    let wasActing = false;
    // Com aba pedida pelo hash, a troca automática só vale nas próximas mudanças.
    let hadChampion = this.initialTab !== null;
    effect(() => {
      const acting = this.needsAction();
      const locked = (this.state().champSelect?.championId ?? 0) > 0;
      untracked(() => {
        if (acting && !wasActing) this.tab.set('pick');
        else if (locked && !hadChampion && !acting && !this.state().champSelect?.benchEnabled) this.tab.set('build');
        if (!this.tabs().some((t) => t.key === this.tab())) this.tab.set('pick');
      });
      wasActing = acting;
      hadChampion = locked;
    });
  }
}
