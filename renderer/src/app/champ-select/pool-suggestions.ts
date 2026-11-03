import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import { MyMatchesService } from '../history/my-matches.service';
import type { ChampSelectState } from '../lcu/lcu.types';
import { allPositionsTierList, assignPositions } from '../stats/match-context';
import type { CounterData, TierEntry } from '../stats/stats.types';
import { rankPool } from './pool-rank';

/** "Para você": até 4 dos seus campeões para esta seleção, com um clique para escolher. */
@Component({
  selector: 'app-pool-suggestions',
  template: `
    @if (suggestions().length) {
      <div class="pool">
        <span class="title">
          Para você
          <small>
            {{ opponent() ? 'seu histórico + confronto contra ' + opponent()!.name : 'pelo seu histórico nesta rota' }}
          </small>
        </span>
        <div class="list">
          @for (s of suggestions(); track s.championId) {
            @if (champion(s.championId); as c) {
              <button type="button" class="pick" [disabled]="disabled()" [title]="'Escolher ' + c.name" (click)="chosen.emit(c)">
                <img [src]="ddragon.championIconUrl(c)" [alt]="c.name" />
                <span class="text">
                  <strong>{{ c.name }}</strong>
                  <span class="line">
                    <b [class.good]="s.wins / s.games >= 0.55" [class.bad]="s.wins / s.games < 0.45">{{ pct(s.wins, s.games) }}%</b>
                    em {{ s.games }} suas
                  </span>
                  @if (s.matchup !== null && opponent()) {
                    <span class="line">
                      <b [class.good]="s.matchup >= 0.52" [class.bad]="s.matchup < 0.48">{{ (s.matchup * 100).toFixed(0) }}%</b>
                      vs {{ opponent()!.name }}
                    </span>
                  }
                </span>
              </button>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .pool {
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
    }
    .title {
      font-weight: 700;
      font-size: 13px;
    }
    .title small {
      margin-left: 6px;
      font-weight: 500;
      color: var(--muted);
    }
    .list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 8px;
    }
    .pick {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--text);
      text-align: left;
      cursor: pointer;
      transition: border-color var(--dur-fast), transform var(--dur-fast);
    }
    .pick:hover:not(:disabled) {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .pick img {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-xs);
    }
    .text {
      display: grid;
      min-width: 0;
    }
    .text strong {
      font-size: 13px;
    }
    .line {
      font-size: 11px;
      color: var(--muted);
    }
    .good {
      color: var(--success);
    }
    .bad {
      color: var(--danger);
    }
  `,
})
export class PoolSuggestions {
  readonly session = input.required<ChampSelectState>();
  readonly disabled = input(false);
  readonly chosen = output<ChampionInfo>();

  protected readonly ddragon = inject(DataDragonService);
  private readonly myMatches = inject(MyMatchesService);
  private readonly tierList = signal<TierEntry[]>([]);
  private readonly counters = signal<CounterData | null>(null);

  /** Inimigo da sua rota, pela rota mais provável de cada campeão inimigo revelado. */
  protected readonly opponent = computed(() => {
    const lane = this.session().assignedPosition.toUpperCase();
    const enemies = this.session().enemyChampionIds ?? [];
    if (!lane || !enemies.length) return null;
    const positions = assignPositions(enemies, this.tierList());
    const id = enemies.find((e) => positions.get(e) === lane);
    const champion = id ? this.ddragon.champion(id) : null;
    return champion && id ? { id, name: champion.name } : null;
  });

  protected readonly suggestions = computed(() => {
    const data = this.myMatches.data();
    if (!data) return [];
    const session = this.session();
    const pickable = new Set(session.pickableChampionIds);
    const counters = this.counters();
    const opponent = this.opponent();
    return rankPool(
      data.rows,
      session.assignedPosition,
      pickable,
      this.tierList(),
      counters && opponent && counters.championId === opponent.id ? counters : null,
    );
  });

  constructor() {
    void this.myMatches.load();
    void allPositionsTierList().then((list) => this.tierList.set(list));
    effect(() => {
      const opponent = this.opponent();
      const lane = this.session().assignedPosition.toUpperCase() || null;
      if (!opponent || !window.stats) return;
      untracked(() => {
        if (this.counters()?.championId === opponent.id) return;
        window.stats!.counters(opponent.id, lane).then((data) => this.counters.set(data)).catch(() => undefined);
      });
    });
  }

  protected champion(id: number): ChampionInfo | null {
    return this.ddragon.champion(id);
  }

  protected pct(wins: number, games: number): number {
    return games ? Math.round((wins / games) * 100) : 0;
  }
}
