import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BuildPanel } from '../builds/build-panel';
import { NavigationService } from '../core/navigation.service';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import { LcuService } from '../lcu/lcu.service';
import { Icon } from '../ui/icon';

const POSITIONS = [
  { value: '', label: 'Qualquer rota' },
  { value: 'top', label: 'Topo' },
  { value: 'jungle', label: 'Selva' },
  { value: 'middle', label: 'Meio' },
  { value: 'bottom', label: 'Atirador' },
  { value: 'utility', label: 'Suporte' },
];

@Component({
  selector: 'app-builds-view',
  imports: [BuildPanel, ChampionStatsPanel, Icon],
  templateUrl: './builds-view.html',
  styleUrl: './builds-view.scss',
})
export class BuildsView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly nav = inject(NavigationService);

  constructor() {
    // Campeão pedido por outra tela (tier list): seleciona e ajusta a rota.
    // Espera a lista de campeões do Data Dragon carregar antes de consumir o pedido.
    effect(() => {
      const request = this.nav.buildsRequest();
      if (!request || this.ddragon.championList().length === 0) return;
      untracked(() => {
        const champion = this.ddragon.champion(request.championId);
        if (champion) this.selected.set(champion);
        if (request.position) this.position.set(request.position.toLowerCase());
        this.nav.buildsRequest.set(null);
      });
    });
  }

  protected readonly positions = POSITIONS;
  protected readonly search = signal('');
  protected readonly position = signal('');
  protected readonly selected = signal<ChampionInfo | null>(null);
  protected readonly connected = computed(() => this.lcu.state().status === 'connected');
  protected readonly positionLabel = computed(
    () => POSITIONS.find((option) => option.value === this.position())?.label ?? '',
  );

  protected readonly champions = computed(() => {
    const term = normalize(this.search());
    return this.ddragon
      .championList()
      .filter((champion) => !term || normalize(champion.name).includes(term));
  });

  protected select(champion: ChampionInfo): void {
    this.selected.set(champion);
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
