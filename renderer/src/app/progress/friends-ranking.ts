import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import type { FriendQueueRank, FriendRankRow, FriendsRanking, RankedQueue } from '../core/app.types';
import { ToastService } from '../core/toast.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { tierName } from '../riot/labels';
import { Icon } from '../ui/icon';

type Period = 'season' | 'week';

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);
const NO_RECENT = { weekWins: 0, weekLosses: 0, streak: 0, lastPlayed: null };

/** Partidas recentes da fila (zeradas enquanto o histórico não chega). */
export function recentIn(row: FriendRankRow, queue: RankedQueue) {
  return row.recent?.[queue] ?? NO_RECENT;
}

/** Linhas mostradas antes do "Ver todos". */
const SHORT_LIST = 10;

interface Highlight {
  icon: string;
  label: string;
  text: string;
  tone: 'good' | 'bad' | 'warn' | 'accent';
}

/** Degrau do elo (4 por tier); Mestre+ conta como um degrau a mais por tier. */
export function rankStep(tier: string, division: string): number | null {
  const t = TIERS.indexOf(tier);
  if (t < 0) return null;
  return t * 4 + (APEX.has(tier) ? 3 : Math.max(DIVISIONS.indexOf(division), 0));
}

/** Nome do elo com a divisão (sem divisão no Mestre+). */
export function rankLabel(tier: string, division: string): string {
  if (!tier) return '';
  return APEX.has(tier) || !division ? tierName(tier) : `${tierName(tier)} ${division}`;
}

/** Ordena o ranking: temporada pelo elo, semana pelo PDL ganho (e depois pelas vitórias). */
export function sortRanking(rows: FriendRankRow[], queue: RankedQueue, period: Period): FriendRankRow[] {
  const ranked = rows.filter((row) => row.ranks[queue]);
  if (period === 'season') return [...ranked].sort((a, b) => b.ranks[queue]!.ladder - a.ranks[queue]!.ladder);
  const games = (row: FriendRankRow) => recentIn(row, queue).weekWins + recentIn(row, queue).weekLosses;
  return [...ranked].sort(
    (a, b) =>
      (b.weekLp[queue] ?? 0) - (a.weekLp[queue] ?? 0) ||
      recentIn(b, queue).weekWins - recentIn(a, queue).weekWins ||
      games(b) - games(a) ||
      b.ranks[queue]!.ladder - a.ranks[queue]!.ladder,
  );
}

/**
 * Ranking dos amigos (Progresso): elo da temporada ou o PDL ganho na semana, separado
 * por Solo/Duo e Flex, com destaques e um botão para copiar a imagem e mandar no grupo.
 */
@Component({
  selector: 'app-friends-ranking',
  imports: [Icon],
  templateUrl: './friends-ranking.html',
  styleUrl: './friends-ranking.scss',
})
export class FriendsRankingPanel {
  private readonly ddragon = inject(DataDragonService);
  private readonly toast = inject(ToastService);
  private readonly board = viewChild<ElementRef<HTMLElement>>('board');

  protected readonly available = !!window.app?.friendsRanking;
  protected readonly data = signal<FriendsRanking | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly queue = signal<RankedQueue>('solo');
  protected readonly period = signal<Period>('season');
  protected readonly expanded = signal(false);
  protected readonly sharing = signal(false);
  protected readonly canShare = !!window.app?.captureImage;

  protected readonly rankLabel = rankLabel;

  protected readonly sorted = computed(() => {
    const data = this.data();
    return data ? sortRanking(data.rows, this.queue(), this.period()) : [];
  });

  protected readonly visible = computed(() => {
    const rows = this.sorted();
    if (this.expanded() || rows.length <= SHORT_LIST) return rows;
    // Sempre mostra você, mesmo fora do top.
    const top = rows.slice(0, SHORT_LIST);
    const me = rows.find((row) => row.isMe);
    return me && !top.includes(me) ? [...top, me] : top;
  });

  protected readonly hiddenCount = computed(() => Math.max(0, this.sorted().length - this.visible().length));

  protected readonly unranked = computed(() => {
    const data = this.data();
    return data ? data.rows.filter((row) => !row.ranks[this.queue()]).length : 0;
  });

  protected readonly myPlace = computed(() => {
    const rows = this.sorted();
    const index = rows.findIndex((row) => row.isMe);
    if (index < 0) return null;
    const me = rows[index];
    const above = index > 0 ? rows[index - 1] : null;
    if (!above) return { place: 1, text: `Você está em 1º entre ${rows.length}.` };
    const q = this.queue();
    const gap =
      this.period() === 'season'
        ? above.ranks[q]!.ladder - me.ranks[q]!.ladder
        : (above.weekLp[q] ?? 0) - (me.weekLp[q] ?? 0);
    const chase = gap > 0 ? ` · faltam ${gap} PDL para passar ${above.gameName}` : ` · empatado com ${above.gameName}`;
    return { place: index + 1, text: `Você está em ${index + 1}º entre ${rows.length}${chase}.` };
  });

  protected readonly highlights = computed<Highlight[]>(() => {
    const data = this.data();
    if (!data) return [];
    const q = this.queue();
    const rows = data.rows.filter((row) => row.ranks[q]);
    const list: Highlight[] = [];
    const name = (row: FriendRankRow) => (row.isMe ? 'Você' : row.gameName);

    const bestWeek = [...rows].filter((r) => (r.weekLp[q] ?? 0) > 0).sort((a, b) => b.weekLp[q]! - a.weekLp[q]!)[0];
    if (bestWeek) list.push({ icon: 'arrow-up', label: 'Mais PDL na semana', text: `${name(bestWeek)}: +${bestWeek.weekLp[q]} PDL`, tone: 'good' });

    const climber = rows
      .map((row) => ({ row, gain: this.seasonGain(row.ranks[q]!) }))
      .filter((x) => x.gain !== null && x.gain > 0)
      .sort((a, b) => b.gain! - a.gain!)[0];
    if (climber) {
      const r = climber.row.ranks[q]!;
      list.push({
        icon: 'layers',
        label: 'Quem mais subiu na temporada',
        text: `${name(climber.row)}: ${rankLabel(r.previousTier, r.previousDivision)} → ${rankLabel(r.tier, r.division)}`,
        tone: 'accent',
      });
    }

    const streak = (row: FriendRankRow) => recentIn(row, q).streak;
    const hot = [...rows].sort((a, b) => streak(b) - streak(a))[0];
    if (hot && streak(hot) >= 3) list.push({ icon: 'progress', label: 'Embalado', text: `${name(hot)}: ${streak(hot)} vitórias seguidas`, tone: 'good' });

    const cold = [...rows].sort((a, b) => streak(a) - streak(b))[0];
    if (cold && streak(cold) <= -3) list.push({ icon: 'arrow-down', label: 'Pior sequência', text: `${name(cold)}: ${-streak(cold)} derrotas seguidas`, tone: 'bad' });

    const games = (row: FriendRankRow) => recentIn(row, q).weekWins + recentIn(row, q).weekLosses;
    const grinder = [...rows].sort((a, b) => games(b) - games(a))[0];
    if (grinder && games(grinder) >= 5) list.push({ icon: 'history', label: 'Mais jogou na semana', text: `${name(grinder)}: ${games(grinder)} partidas`, tone: 'warn' });

    return list.slice(0, 4);
  });

  /** A base de PDL da semana foi tirada depois de segunda (o app abriu no meio da semana). */
  protected readonly weekNote = computed(() => {
    const data = this.data();
    if (!data || data.baseTakenAt - data.weekStart < 60 * 60_000) return null;
    const date = new Date(data.baseTakenAt);
    const when = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    return `PDL da semana contado desde ${when}, quando o app viu seus amigos pela primeira vez nesta semana. (As vitórias e derrotas não dependem disso.)`;
  });

  constructor() {
    if (!this.available) return;
    void this.load(false);
    // O histórico dos amigos chega aos poucos, em segundo plano.
    const unsubscribe = window.app?.onFriendsUpdated?.(() => void this.refresh());
    inject(DestroyRef).onDestroy(() => unsubscribe?.());
  }

  /** Recarrega sem forçar (pega o que o processo principal já leu). */
  private async refresh(): Promise<void> {
    if (!window.app?.friendsRanking || this.loading()) return;
    try {
      this.data.set(await window.app.friendsRanking(false));
    } catch {
      // Mantém o que já está na tela.
    }
  }

  protected async load(force: boolean): Promise<void> {
    if (!window.app?.friendsRanking || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await window.app.friendsRanking(force));
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '';
      this.error.set(message || 'Não foi possível ler seus amigos agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected setQueue(queue: RankedQueue): void {
    this.queue.set(queue);
    this.expanded.set(false);
  }

  protected setPeriod(period: Period): void {
    this.period.set(period);
    this.expanded.set(false);
  }

  protected rank(row: FriendRankRow): FriendQueueRank {
    return row.ranks[this.queue()]!;
  }

  protected iconUrl(row: FriendRankRow): string | null {
    return this.ddragon.profileIconUrl(row.icon);
  }

  protected status(row: FriendRankRow): { label: string; tone: string } | null {
    if (row.isMe) return null;
    if (row.gameStatus === 'inGame') return { label: 'Em partida', tone: 'live' };
    if (row.gameStatus === 'championSelect') return { label: 'Na seleção', tone: 'live' };
    if (row.availability === 'chat' || row.availability === 'away' || row.availability === 'dnd') return { label: 'Online', tone: 'online' };
    return null;
  }

  /** Degraus subidos desde o fim da temporada passada (null se não jogou a passada). */
  protected seasonGain(rank: FriendQueueRank): number | null {
    const now = rankStep(rank.tier, rank.division);
    const before = rankStep(rank.previousTier, rank.previousDivision);
    return now === null || before === null ? null : now - before;
  }

  protected gainLabel(rank: FriendQueueRank): string {
    const gain = this.seasonGain(rank);
    if (gain === null) return '—';
    if (gain === 0) return '=';
    const n = Math.abs(gain);
    return `${gain > 0 ? '▲' : '▼'} ${n} ${n === 1 ? 'divisão' : 'divisões'}`;
  }

  protected gainTitle(rank: FriendQueueRank): string {
    if (!rank.previousTier) return 'Não terminou a temporada passada nesta fila.';
    return `Terminou a temporada passada em ${rankLabel(rank.previousTier, rank.previousDivision)}.`;
  }

  protected peakLabel(rank: FriendQueueRank): string {
    return rank.peakTier ? rankLabel(rank.peakTier, rank.peakDivision) : '—';
  }

  protected weekLpLabel(row: FriendRankRow): string {
    const lp = row.weekLp[this.queue()];
    if (lp === null) return '—';
    return `${lp > 0 ? '+' : ''}${lp}`;
  }

  protected recent(row: FriendRankRow) {
    return recentIn(row, this.queue());
  }

  protected weekGames(row: FriendRankRow): number {
    const r = this.recent(row);
    return r.weekWins + r.weekLosses;
  }

  protected streakLabel(row: FriendRankRow): string {
    if (!row.recent) return '';
    const s = this.recent(row).streak;
    if (Math.abs(s) < 2) return '';
    return s > 0 ? `${s}V seguidas` : `${-s}D seguidas`;
  }

  protected async share(): Promise<void> {
    const element = this.board()?.nativeElement;
    if (!element || !window.app?.captureImage) return;
    this.sharing.set(true);
    // Mostra a lista toda (até 15) na imagem e espera o Angular desenhar.
    const wasExpanded = this.expanded();
    this.expanded.set(false);
    element.classList.add('capturing');
    await new Promise((resolve) => setTimeout(resolve, 120));
    try {
      const r = element.getBoundingClientRect();
      const queue = this.queue() === 'solo' ? 'solo' : 'flex';
      const done = await window.app.captureImage({ x: r.x, y: r.y, width: r.width, height: r.height }, 'copy', `ranking-amigos-${queue}`);
      if (done) this.toast.show('Ranking copiado: é só colar (Ctrl+V) no grupo.', 'success');
      else this.toast.show('Não foi possível gerar a imagem.', 'error');
    } catch {
      this.toast.show('Não foi possível gerar a imagem.', 'error');
    } finally {
      element.classList.remove('capturing');
      this.expanded.set(wasExpanded);
      this.sharing.set(false);
    }
  }
}
