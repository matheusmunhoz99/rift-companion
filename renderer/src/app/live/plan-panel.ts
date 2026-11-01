import { Component, inject, input, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PlanResponse } from '../history/riot.types';
import { Icon } from '../ui/icon';

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
  protected readonly open = signal(true);
  protected readonly ddragon = inject(DataDragonService);

  protected planKind(kind: 'oportunidade' | 'cuidado' | 'dica'): string {
    return { oportunidade: 'Oportunidade', cuidado: 'Cuidado', dica: 'Dica' }[kind];
  }

  protected pct(value: number): number {
    return Math.round(value * 100);
  }
}
