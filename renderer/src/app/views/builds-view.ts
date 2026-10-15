import { Component, computed, inject, signal } from '@angular/core';
import { BuildPanel } from '../builds/build-panel';
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
  imports: [BuildPanel, Icon],
  templateUrl: './builds-view.html',
  styleUrl: './builds-view.scss',
})
export class BuildsView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);

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
