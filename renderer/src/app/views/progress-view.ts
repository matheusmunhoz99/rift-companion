import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { RankEntry, RankedQueue } from '../core/app.types';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { tierName } from '../riot/labels';
import { currentRank, forQueue, ladderSeries, summarize, todayEntries } from '../progress/rank-stats';
import { Icon } from '../ui/icon';

const QUEUE_LABEL: Record<RankedQueue, string> = { solo: 'Solo/Duo', flex: 'Flex' };
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);
/** Quantas partidas aparecem na lista recente. */
const RECENT_LIMIT = 15;

interface SparkPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-progress-view',
  imports: [Icon],
  templateUrl: './progress-view.html',
  styleUrl: './progress-view.scss',
})
export class ProgressView {
  private readonly ddragon = inject(DataDragonService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly queue = signal<RankedQueue>('solo');
  protected readonly entries = signal<RankEntry[] | null>(null);
  protected readonly loading = signal(true);

  protected readonly queueLabel = (q: RankedQueue) => QUEUE_LABEL[q];
  protected readonly tierName = tierName;

  /** Filas que têm pelo menos uma partida registrada. */
  protected readonly availableQueues = computed<RankedQueue[]>(() => {
    const all = this.entries() ?? [];
    return (['solo', 'flex'] as const).filter((q) => all.some((e) => e.queue === q));
  });

  protected readonly rank = computed(() => currentRank(this.entries() ?? [], this.queue()));

  protected readonly today = computed(() =>
    summarize(todayEntries(this.entries() ?? [], this.queue())),
  );

  /** Lista recente da fila (mais novas primeiro). */
  protected readonly recent = computed(() =>
    forQueue(this.entries() ?? [], this.queue()).slice(0, RECENT_LIMIT),
  );

  /** Pontos do gráfico de PDL, normalizados numa área de 100×40. */
  protected readonly spark = computed(() => {
    const series = ladderSeries(this.entries() ?? [], this.queue());
    if (series.length < 2) return null;
    const values = series.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = 100 / (series.length - 1);
    const points: SparkPoint[] = series.map((p, i) => ({
      x: +(i * stepX).toFixed(2),
      y: +(38 - ((p.value - min) / span) * 36).toFixed(2),
    }));
    const line = points.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `0,40 ${line} 100,40`;
    const net = values[values.length - 1] - values[0];
    return { line, area, net, last: points[points.length - 1] };
  });

  protected readonly rankTier = computed(() => this.rank()?.tier ?? '');

  protected readonly rankText = computed(() => {
    const r = this.rank();
    if (!r) return null;
    const division = APEX.has(r.tier) ? '' : ` ${r.division}`;
    return `${tierName(r.tier)}${division}`;
  });

  private unsubscribe?: () => void;

  constructor() {
    void this.load();
    // Atualiza quando uma partida ranqueada é registrada; limpa ao sair da tela.
    this.unsubscribe = window.app?.onRankUpdated(() => void this.load());
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  protected pick(q: RankedQueue): void {
    this.queue.set(q);
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected dayLabel(at: number): string {
    const d = new Date(at);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  protected timeLabel(at: number): string {
    return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  private async load(): Promise<void> {
    if (!window.app) {
      this.loading.set(false);
      this.entries.set([]);
      return;
    }
    try {
      const history = await window.app.rankHistory();
      this.entries.set(history);
      // Começa pela fila com partidas, preferindo a Solo/Duo.
      const queues = this.availableQueues();
      if (queues.length && !queues.includes(this.queue())) this.queue.set(queues[0]);
    } catch {
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
