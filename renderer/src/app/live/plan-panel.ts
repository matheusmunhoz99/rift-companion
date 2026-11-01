import { Component, effect, inject, input, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PlanResponse } from '../history/riot.types';
import { Icon } from '../ui/icon';

/** A tela de carregamento dura ~1 a 2 min; depois disso o plano se recolhe sozinho. */
const COLLAPSE_AFTER_S = 150;

/**
 * Plano de jogo da tela de carregamento: resumo da IA (como o time vence, oportunidades,
 * cuidados) e opções de build das estatísticas Mestre+. Recomendação antes da partida.
 */
@Component({
  selector: 'app-plan-panel',
  templateUrl: './plan-panel.html',
  styleUrl: './plan-panel.scss',
  imports: [Icon],
})
export class PlanPanel {
  readonly plan = input<PlanResponse | null>(null);
  readonly loading = input(false);
  /** Segundos de partida: passado o carregamento, o plano se recolhe sozinho (uma vez). */
  readonly elapsed = input<number | null>(null);
  protected readonly open = signal(true);
  protected readonly ddragon = inject(DataDragonService);
  private touched = false;
  private autoCollapsed = false;

  constructor() {
    // Na tela de carregamento o plano fica aberto; com a partida andando, os cards dos
    // jogadores importam mais: recolhe sozinho, deixando o resumo numa linha.
    effect(() => {
      const elapsed = this.elapsed();
      if (this.touched || this.autoCollapsed || elapsed === null || elapsed < COLLAPSE_AFTER_S) return;
      this.autoCollapsed = true;
      this.open.set(false);
    });
  }

  protected toggle(): void {
    this.touched = true;
    this.open.update((open) => !open);
  }

  protected planKind(kind: 'oportunidade' | 'cuidado' | 'dica'): string {
    return { oportunidade: 'Oportunidade', cuidado: 'Cuidado', dica: 'Dica' }[kind];
  }

  protected pct(value: number): number {
    return Math.round(value * 100);
  }
}
