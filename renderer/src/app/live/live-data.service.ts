import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveDashboard, LivePlayer } from '../history/riot.types';
import { LcuService } from '../lcu/lcu.service';
import { detectEnemyItemSpikes, type ItemSpike } from './item-spikes';
import { emptyJournal, rememberRead, updateJournal, type Journal } from './match-journal';

const POLL_MS = 1_000;
/** Um ponto do gráfico de vantagem a cada 20 s de jogo. */
const SAMPLE_EVERY_S = 20;

export interface GoldSample {
  /** Segundos de jogo. */
  time: number;
  /** Valor dos itens do seu time menos o dos inimigos. */
  diff: number;
}

/**
 * Dados ao vivo do próprio jogo enquanto a partida roda. Fica na raiz do app:
 * o gráfico continua acumulando mesmo com a tela fechada.
 */
@Injectable({ providedIn: 'root' })
export class LiveDataService {
  private readonly lcu = inject(LcuService);
  private readonly ddragon = inject(DataDragonService);

  readonly data = signal<LiveDashboard | null>(null);
  private readonly fetchedAt = signal(0);
  private readonly now = signal(Date.now());
  readonly history = signal<GoldSample[]>([]);
  /** Alertas recentes de itens críticos fechados pelo time inimigo. */
  readonly itemSpikes = signal<ItemSpike[]>([]);
  private seenEnemyItems: Set<string> | null = null;
  /** Feitiços marcados como usados: "riotId|slot" -> tempo de jogo em que voltam. */
  readonly spellTimers = signal<ReadonlyMap<string, number>>(new Map());

  /** Marca o feitiço como usado agora; marcar de novo desfaz (clique errado ou já voltou). */
  toggleSpell(key: string, cooldown: number): void {
    this.spellTimers.update((current) => {
      const next = new Map(current);
      const readyAt = next.get(key);
      if (readyAt !== undefined && readyAt > this.clock()) next.delete(key);
      else next.set(key, this.clock() + cooldown);
      return next;
    });
  }

  /** Diário da partida (mortes, compras, evolução, leituras da IA): a IA aprende com ele. */
  readonly journal = signal<Journal>(emptyJournal());

  /** Guarda as opções de uma leitura da IA para a próxima. */
  rememberRead(t: number, opcoes: string[], itens: number[]): void {
    this.journal.update((j) => rememberRead(j, t, opcoes, itens));
  }

  /** Campos da selva marcados como mortos: id do campo -> tempo de jogo em que voltam. */
  readonly campTimers = signal<ReadonlyMap<string, number>>(new Map());

  /** Marca o campo como morto agora (conta até voltar); marcar de novo desfaz. */
  toggleCamp(key: string, respawn: number): void {
    this.campTimers.update((current) => {
      const next = new Map(current);
      const backAt = next.get(key);
      if (backAt !== undefined && backAt > this.clock()) next.delete(key);
      else next.set(key, this.clock() + respawn);
      return next;
    });
  }

  /** Campo visto morrer pela tela: volta em `backAt` (tempo de jogo), lido do minimapa. */
  setCamp(key: string, backAt: number): void {
    this.campTimers.update((current) => new Map(current).set(key, backAt));
  }

  /** Tempo de jogo corrente: o último lido mais o tempo desde a leitura (o jogo não pausa). */
  readonly clock = computed(() => {
    const data = this.data();
    if (!data) return 0;
    return data.gameTime + Math.max(0, (this.now() - this.fetchedAt()) / 1000);
  });

  /** Valor dos itens de cada jogador (o "ouro gasto"; ouro no bolso só aparece o seu). */
  itemValue(player: LivePlayer): number {
    return player.items.reduce((total, item) => total + this.ddragon.itemCost(item.id) * Math.max(item.count, 1), 0);
  }

  readonly teamValue = computed(() => {
    const players = this.data()?.players ?? [];
    const sum = (ally: boolean) => players.filter((p) => p.ally === ally).reduce((t, p) => t + this.itemValue(p), 0);
    return { ally: sum(true), enemy: sum(false) };
  });

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const clock = setInterval(() => this.now.set(Date.now()), 500);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      this.stop();
    });

    effect(() => {
      const phase = this.lcu.state().gameflowPhase;
      const inGame = phase === 'InProgress' || phase === 'Reconnect';
      untracked(() => (inGame ? this.start() : this.stop()));
    });
  }

  private start(): void {
    if (this.timer || !window.riot) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.data.set(null);
    this.history.set([]);
    this.itemSpikes.set([]);
    this.seenEnemyItems = null;
    this.spellTimers.set(new Map());
    this.campTimers.set(new Map());
    this.journal.set(emptyJournal());
  }

  private polling = false;

  private async poll(): Promise<void> {
    // Leitura a cada 1 s: uma resposta lenta não empilha outra em cima.
    if (this.polling) return;
    this.polling = true;
    const data = await window.riot?.getLiveDashboard().catch(() => null);
    this.polling = false;
    if (!data) return;
    const previous = this.data();
    // Tempo voltou: outra partida (ou replay); o gráfico recomeça.
    if (previous && data.gameTime + 5 < previous.gameTime) {
      this.history.set([]);
      this.itemSpikes.set([]);
      this.seenEnemyItems = null;
    }
    this.data.set(data);
    this.fetchedAt.set(Date.now());
    this.sample(data);
    if (this.seenEnemyItems === null) {
      this.seenEnemyItems = new Set<string>();
      detectEnemyItemSpikes(data.players, data.gameTime, this.seenEnemyItems, true);
    } else {
      const spikes = detectEnemyItemSpikes(data.players, data.gameTime, this.seenEnemyItems, false);
      if (spikes.length) this.itemSpikes.update((prev) => [...spikes, ...prev].slice(0, 12));
    }
    this.journal.update((j) => updateJournal(j, data, (id) => this.ddragon.itemCost(id), (p) => this.itemValue(p)));
  }

  private sample(data: LiveDashboard): void {
    const value = this.teamValue();
    if (!value.ally && !value.enemy) return;
    const history = this.history();
    const last = history[history.length - 1];
    if (last && data.gameTime - last.time < SAMPLE_EVERY_S) return;
    this.history.set([...history, { time: Math.round(data.gameTime), diff: value.ally - value.enemy }]);
  }
}
