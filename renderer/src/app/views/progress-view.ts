import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { RankEntry, RankedQueue } from '../core/app.types';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { tierName } from '../riot/labels';
import { currentRank, forQueue, ladderChart, ladderLabel, summarize, todayEntries } from '../progress/rank-stats';
import { Icon } from '../ui/icon';
import { MyMatchesService } from '../history/my-matches.service';
import { partiesOf } from '../match/parties';
import { partnerStats, type WinRecord } from '../progress/partners';

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
  private readonly myMatches = inject(MyMatchesService);
  protected readonly matchesLoading = this.myMatches.loading;

  /** Sozinho x em grupo, parceiros de duo e seus melhores campeões (últimas partidas). */
  protected readonly partners = computed(() => {
    const data = this.myMatches.data();
    if (!data || data.rows.length < 3) return null;
    const stats = partnerStats(data.rows, (match) => partiesOf(match, data.matches));
    return { ...stats, total: stats.solo.games + stats.grouped.games };
  });

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

  /** Gráfico da escada (elo + divisão + PDL) das últimas 30 partidas da fila. */
  protected readonly chart = computed(() => {
    const chart = ladderChart(this.entries() ?? [], this.queue(), 30);
    if (!chart) return null;
    const line = chart.points.map((p) => `${p.x},${p.y}`).join(' ');
    return {
      ...chart,
      line,
      area: `0,100 ${line} 100,100`,
      grid: chart.grid.map((g) => ({ ...g, label: this.ladderText(g.value) })),
      dots: chart.points.map((p) => ({
        x: p.x,
        y: p.y,
        win: p.entry.win,
        title: `${p.entry.win === true ? 'Vitória' : p.entry.win === false ? 'Derrota' : 'Partida'} · ${p.entry.lpChange >= 0 ? '+' : ''}${p.entry.lpChange} PDL · ${this.rankAfter(p.entry)} · ${this.dayLabel(p.entry.at)} ${this.timeLabel(p.entry.at)}`,
      })),
      from: this.dayLabel(chart.points[0].entry.at),
      to: this.dayLabel(chart.points[chart.points.length - 1].entry.at),
      games: chart.points.length,
    };
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
    void this.myMatches.load();
    // Atualiza quando uma partida ranqueada é registrada; limpa ao sair da tela.
    this.unsubscribe = window.app?.onRankUpdated(() => void this.load());
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  protected pct(wins: number, games: number): number {
    return games ? Math.round((wins / games) * 100) : 0;
  }

  protected tone(r: WinRecord): string {
    const rate = r.games ? r.wins / r.games : 0.5;
    return rate >= 0.55 ? 'up' : rate < 0.45 ? 'down' : '';
  }

  protected diffLabel(points: number): string {
    return `${points > 0 ? '+' : ''}${points} pts`;
  }

  protected pick(q: RankedQueue): void {
    this.queue.set(q);
  }

  protected championName(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? '';
  }

  /** Elo depois da partida: "Platina III · 82 PDL". */
  protected rankAfter(e: RankEntry): string {
    const division = APEX.has(e.tier) ? '' : ` ${e.division}`;
    return `${tierName(e.tier)}${division} · ${e.lp} PDL`;
  }

  private ladderText(value: number): string {
    const label = ladderLabel(value);
    return label.division ? `${tierName(label.tier)} ${label.division}` : tierName(label.tier);
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
