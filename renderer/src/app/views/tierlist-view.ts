import { Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationService } from '../core/navigation.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { STATS_POSITIONS, percent, type StatsMeta, type TierEntry } from '../stats/stats.types';

type Sort = 'tier' | 'winRate' | 'pickRate' | 'banRate' | 'games';
const TIER_ORDER = ['S+', 'S', 'A', 'B', 'C'];

@Component({
  selector: 'app-tierlist-view',
  templateUrl: './tierlist-view.html',
  styleUrl: './tierlist-view.scss',
})
export class TierListView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly nav = inject(NavigationService);

  protected readonly positions = STATS_POSITIONS;
  protected readonly position = signal('JUNGLE');
  protected readonly entries = signal<TierEntry[]>([]);
  protected readonly meta = signal<StatsMeta | null>(null);
  protected readonly loading = signal(false);
  protected readonly sort = signal<Sort>('tier');
  protected readonly search = signal('');
  protected readonly percent = percent;

  protected readonly rows = computed(() => {
    const term = this.search().toLowerCase().trim();
    const key = this.sort();
    return this.entries()
      .filter((e) => !term || (this.ddragon.champion(e.championId)?.name ?? '').toLowerCase().includes(term))
      .sort((a, b) =>
        key === 'tier'
          ? TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.winRate - a.winRate
          : b[key] - a[key],
      );
  });

  constructor() {
    effect(() => void this.load(this.position()));
    void window.stats?.meta().then((meta) => this.meta.set(meta)).catch(() => null);
  }

  protected open(entry: TierEntry): void {
    this.nav.openBuilds(entry.championId, entry.position);
  }

  protected name(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? `#${championId}`;
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  private async load(position: string): Promise<void> {
    if (!window.stats) return;
    this.loading.set(true);
    try {
      this.entries.set(await window.stats.tierList(position));
    } catch {
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
