import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { isStatShard, type BuildsResponse, type ItemBuild, type RunePageSuggestion } from './builds.types';

const STYLE_NAMES: Record<number, string> = {
  8000: 'Precisão',
  8100: 'Dominação',
  8200: 'Feitiçaria',
  8300: 'Inspiração',
  8400: 'Determinação',
};

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-build-panel',
  templateUrl: './build-panel.html',
  styleUrl: './build-panel.scss',
})
export class BuildPanel {
  readonly championId = input.required<number>();
  readonly position = input<string>('');
  readonly inChampSelect = input(false);

  protected readonly ddragon = inject(DataDragonService);
  protected readonly data = signal<BuildsResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly withSpells = signal(true);

  protected readonly champion = computed(() => this.ddragon.champion(this.championId()));

  constructor() {
    effect(() => {
      const championId = this.championId();
      const position = this.position();
      if (championId > 0) void this.load(championId, position);
    });
  }

  protected styleName(id: number): string {
    return STYLE_NAMES[id] ?? String(id);
  }

  /** Runas menores, sem a principal e sem os fragmentos de atributo. */
  protected minorPerks(page: RunePageSuggestion) {
    return page.perks.filter((perk) => perk.id !== page.keystone.id && !isStatShard(perk.id));
  }

  protected statPerks(page: RunePageSuggestion) {
    return page.perks.filter((perk) => isStatShard(perk.id));
  }

  protected async applyRunes(page: RunePageSuggestion): Promise<void> {
    const name = `${this.champion()?.name ?? 'Campeão'} ${page.keystone.name}`;
    await this.run(page.recommendationId, async () => {
      const result = await window.builds!.applyRunes(page, name, this.withSpells());
      const action = {
        created: 'criada',
        updated: 'atualizada',
        overwritten: 'gravada sobre a página atual',
      }[result.mode];
      return `Página "${result.pageName}" ${action}${result.spellsApplied ? ' + feitiços aplicados' : ''}.`;
    });
  }

  protected async applyItems(build: ItemBuild): Promise<void> {
    await this.run(build.file, async () => {
      const title = await window.builds!.applyItems(this.championId(), build);
      return `Conjunto "${title}" salvo. Ele aparece na loja durante a partida.`;
    });
  }

  private async load(championId: number, position: string): Promise<void> {
    if (!window.builds) return;
    this.loading.set(true);
    this.feedback.set(null);
    try {
      this.data.set(await window.builds.get(championId, position));
    } catch (error) {
      this.data.set(null);
      this.feedback.set({ kind: 'error', text: errorMessage(error) });
    } finally {
      this.loading.set(false);
    }
  }

  private async run(key: string, action: () => Promise<string>): Promise<void> {
    this.busy.set(key);
    this.feedback.set(null);
    try {
      this.feedback.set({ kind: 'success', text: await action() });
    } catch (error) {
      this.feedback.set({ kind: 'error', text: errorMessage(error) });
    } finally {
      this.busy.set(null);
    }
  }
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // O Electron prefixa erros de IPC com "Error invoking remote method '...': Error: ".
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
