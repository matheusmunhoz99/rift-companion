import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import { allPositionsTierList, assignPositions } from '../stats/match-context';
import { statsPositionLabel, type CounterData, type TierEntry } from '../stats/stats.types';

@Component({
  selector: 'app-counter-panel',
  templateUrl: './counter-panel.html',
  styleUrl: './counter-panel.scss',
})
export class CounterPanel {
  readonly enemyChampionIds = input<number[]>([]);
  /** Sua rota na seleção ("jungle", "utility"...); vazia em modos sem rota. */
  readonly assignedPosition = input<string>('');

  protected readonly ddragon = inject(DataDragonService);
  protected readonly selectedEnemy = signal<number>(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly counters = signal<CounterData | null>(null);
  private readonly tierList = signal<TierEntry[]>([]);
  private request = 0;
  /** Depois que você escolhe uma aba, ela não muda sozinha. */
  private pinned = false;

  protected readonly myPosition = computed(() => this.assignedPosition().toUpperCase() || null);

  /** Rota mais provável de cada inimigo, pela distribuição de rotas na coleta Mestre+. */
  private readonly enemyPositions = computed(() => assignPositions(this.enemyChampionIds(), this.tierList()));

  protected readonly enemies = computed(() => {
    const positions = this.enemyPositions();
    const mine = this.myPosition();
    return this.enemyChampionIds()
      .filter((id) => id > 0)
      .map((id) => ({ id, champion: this.ddragon.champion(id), position: positions.get(id) ?? null }))
      .filter((e): e is { id: number; champion: ChampionInfo; position: string | null } => e.champion !== null)
      .map((e) => ({ ...e, laneOpponent: !!mine && e.position === mine }));
  });

  protected readonly selected = computed(() => this.enemies().find((e) => e.id === this.selectedEnemy()) ?? null);

  constructor() {
    void allPositionsTierList().then((list) => this.tierList.set(list));

    // Segue o inimigo da sua rota (que muda conforme o time inimigo escolhe) até você escolher uma aba.
    effect(() => {
      const enemies = this.enemies();
      if (enemies.length === 0) return;
      const selected = untracked(this.selectedEnemy);
      const stillThere = enemies.some((e) => e.id === selected);
      if (this.pinned && stillThere) return;
      this.pinned &&= stillThere;
      this.selectedEnemy.set((enemies.find((e) => e.laneOpponent) ?? (stillThere ? { id: selected } : enemies[0])).id);
    });

    effect(() => {
      const enemy = this.selected();
      if (!enemy || !window.stats) return;
      const position = enemy.position ?? this.myPosition();
      untracked(() => this.load(enemy.id, position));
    });
  }

  private load(championId: number, position: string | null): void {
    const current = this.counters();
    if (current && current.championId === championId && current.position === position && !this.failed()) return;
    const request = ++this.request;
    this.loading.set(true);
    this.failed.set(false);
    window.stats!
      .counters(championId, position)
      .then((data) => {
        if (request === this.request) this.counters.set(data);
      })
      .catch(() => {
        if (request !== this.request) return;
        this.counters.set(null);
        this.failed.set(true);
      })
      .finally(() => {
        if (request === this.request) this.loading.set(false);
      });
  }

  protected selectEnemy(id: number): void {
    this.pinned = true;
    this.selectedEnemy.set(id);
  }

  protected positionLabel(position: string | null): string {
    return position ? statsPositionLabel(position) : '';
  }

  protected icon(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected name(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? '';
  }

  protected wr(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  protected wrClass(value: number): string {
    return value >= 0.53 ? 'high' : value >= 0.48 ? 'mid' : 'low';
  }
}
