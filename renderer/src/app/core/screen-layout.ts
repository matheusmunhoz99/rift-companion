import { computed, signal } from '@angular/core';
import { mergeOrder, moveIn } from './layout-order';

/** Uma seção que a pessoa pode mover ou esconder numa tela. */
export interface LayoutSection {
  id: string;
  label: string;
  /** Uma linha do que tem na seção (aparece no menu "Organizar"). */
  description: string;
}

interface Saved {
  order?: unknown;
  hidden?: unknown;
}

/**
 * Ordem e visibilidade das seções de uma tela (partida ao vivo, fim de jogo), escolhidas
 * por quem usa e guardadas neste aparelho. A tela aplica com CSS `order` sobre a grade do
 * próprio componente, então mover uma seção não recria nada nem perde o que estava aberto.
 *
 * Seção nova numa versão futura entra na posição padrão dela, sem bagunçar o que a pessoa
 * já escolheu; seção que deixou de existir some da lista salva.
 */
export class ScreenLayout {
  readonly order = signal<string[]>([]);
  readonly hidden = signal<ReadonlySet<string>>(new Set());

  /** Seções na ordem escolhida, com a posição e se estão visíveis (para o menu). */
  readonly items = computed(() => {
    const hidden = this.hidden();
    const byId = new Map(this.sections.map((s) => [s.id, s]));
    return this.order().map((id, index) => ({ ...byId.get(id)!, index, visible: !hidden.has(id) }));
  });

  /** Quantas estão escondidas (a tela mostra um atalho para trazer de volta). */
  readonly hiddenItems = computed(() => this.items().filter((item) => !item.visible));

  readonly isDefault = computed(
    () => this.hidden().size === 0 && this.order().every((id, i) => id === this.sections[i]?.id),
  );

  constructor(
    private readonly key: string,
    readonly sections: LayoutSection[],
  ) {
    this.load();
  }

  /** Posição para o CSS `order` (começa em 1: o que não é seção, como a barra do topo, fica antes). */
  position(id: string): number {
    const index = this.order().indexOf(id);
    return index < 0 ? this.sections.length + 1 : index + 1;
  }

  visible(id: string): boolean {
    return !this.hidden().has(id);
  }

  move(id: string, delta: number): void {
    const order = moveIn(this.order(), id, delta);
    if (order === this.order()) return;
    this.order.set(order);
    this.save();
  }

  setVisible(id: string, visible: boolean): void {
    const hidden = new Set(this.hidden());
    if (visible) hidden.delete(id);
    else hidden.add(id);
    this.hidden.set(hidden);
    this.save();
  }

  reset(): void {
    this.order.set(this.sections.map((s) => s.id));
    this.hidden.set(new Set());
    this.save();
  }

  private load(): void {
    const ids = this.sections.map((s) => s.id);
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.key) ?? 'null') as Saved | null;
    } catch {
      saved = null;
    }
    // Seção que a pessoa ainda não viu (versão nova) entra logo depois da vizinha padrão.
    this.order.set(mergeOrder(saved?.order, ids));
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [];
    this.hidden.set(new Set(hidden));
  }

  private save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ order: this.order(), hidden: [...this.hidden()] }));
    } catch {
      // Sem armazenamento: vale até fechar o app.
    }
  }
}
