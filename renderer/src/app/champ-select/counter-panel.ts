import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import type { CounterData, CounterEntry } from '../stats/stats.types';

const POSITION_MAP: Record<string, string> = {
  top: 'TOP',
  jungle: 'JUNGLE',
  middle: 'MIDDLE',
  bottom: 'BOTTOM',
  utility: 'UTILITY',
};

@Component({
  selector: 'app-counter-panel',
  templateUrl: './counter-panel.html',
  styleUrl: './counter-panel.scss',
})
export class CounterPanel {
  readonly enemyChampionIds = input<number[]>([]);
  readonly assignedPosition = input<string>('');

  protected readonly ddragon = inject(DataDragonService);
  protected readonly selectedEnemy = signal<number>(0);
  protected readonly loading = signal(false);
  protected readonly counters = signal<CounterData | null>(null);

  protected readonly enemies = computed(() =>
    this.enemyChampionIds()
      .filter((id) => id > 0)
      .map((id) => ({ id, champion: this.ddragon.champion(id) }))
      .filter((e): e is { id: number; champion: ChampionInfo } => e.champion !== null),
  );

  protected readonly hasEnemies = computed(() => this.enemies().length > 0);

  constructor() {
    effect(() => {
      const enemies = this.enemies();
      const selected = this.selectedEnemy();
      if (enemies.length > 0 && !enemies.some((e) => e.id === selected)) {
        this.selectedEnemy.set(enemies[0].id);
      }
    });

    effect(() => {
      const enemyId = this.selectedEnemy();
      if (!enemyId || !window.stats) return;
      const position = POSITION_MAP[this.assignedPosition()] ?? null;
      this.loading.set(true);
      window.stats
        .counters(enemyId, position)
        .then((data) => this.counters.set(data))
        .catch(() => this.counters.set(null))
        .finally(() => this.loading.set(false));
    });
  }

  protected selectEnemy(id: number): void {
    this.selectedEnemy.set(id);
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
