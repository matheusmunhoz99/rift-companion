import { Component, computed, input } from '@angular/core';

/**
 * Ícones próprios do Rift Companion, desenhados numa grade 24x24: traço angular
 * de 1,75 (cantos vivos, sem pontas arredondadas) e um detalhe preenchido em cada um.
 * Inspirados em elementos do jogo: cristal do Nexus, sentinela, bigorna, emblemas de elo.
 */
interface Shape {
  d: string;
  /** Preenchido em vez de contornado (o detalhe de cada ícone). */
  fill?: boolean;
}

const ICONS: Record<string, Shape[]> = {
  // Cristal do Nexus sobre a base.
  home: [
    { d: 'M12 2.5 17.5 8.5 12 15 6.5 8.5Z' },
    { d: 'M12 5.5 14.5 8.5 12 11.5 9.5 8.5Z', fill: true },
    { d: 'M7 21.5 8.5 17.5H15.5L17 21.5M4 21.5H20' },
  ],
  // Ponta de lança: entrar na fila.
  play: [
    { d: 'M5.5 3.5 20 12 5.5 20.5 8.5 12Z' },
    { d: 'M8.5 12 14 12 8 15.5Z', fill: true },
  ],
  // Lâminas cruzadas: seleção de campeões.
  swords: [
    { d: 'M4 3.5H7L16 12.5 13 15.5 4 6.5Z' },
    { d: 'M20 3.5H17L8 12.5 11 15.5 20 6.5Z' },
    { d: 'M12.5 18.5 18.5 12.5M11.5 18.5 5.5 12.5' },
    { d: 'M16 17 20.5 21.5M8 17 3.5 21.5' },
  ],
  // Olho da sentinela: partida ao vivo.
  live: [
    { d: 'M2 12 7 6H17L22 12 17 18H7Z' },
    { d: 'M12 8.5 15.5 12 12 15.5 8.5 12Z', fill: true },
  ],
  // Divisas de elo: tier list.
  layers: [
    { d: 'M4.5 20.5 12 16.5 19.5 20.5' },
    { d: 'M4.5 14.5 12 10.5 19.5 14.5' },
    { d: 'M4.5 8.5 12 3.5 19.5 8.5Z', fill: true },
  ],
  // Bigorna: builds.
  book: [
    { d: 'M2.5 5.5H20.5L21.5 8.5 16.5 10 15 13H9L7.5 10 2.5 8.5Z' },
    { d: 'M9.5 13V16.5M14.5 13V16.5' },
    { d: 'M6.5 20.5 8 16.5H16L17.5 20.5Z', fill: true },
  ],
  // Ampulheta: histórico.
  history: [
    { d: 'M5.5 2.5H18.5M5.5 21.5H18.5' },
    { d: 'M7 2.5V6L12 12 7 18V21.5M17 2.5V6L12 12 17 18V21.5' },
    { d: 'M9 21.5 12 17.5 15 21.5Z', fill: true },
  ],
  // Porca hexagonal: configurações.
  settings: [
    { d: 'M12 2 20.7 7V17L12 22 3.3 17V7Z' },
    { d: 'M12 8.5 15 10.25V13.75L12 15.5 9 13.75V10.25Z', fill: true },
  ],
  // Lente hexagonal: buscar.
  search: [
    { d: 'M10 2.5 16 6V13L10 16.5 4 13V6Z' },
    { d: 'M15 15 21 21' },
    { d: 'M10 6.5 12.5 8V11L10 12.5Z', fill: true },
  ],
  // Setas angulares: atualizar.
  refresh: [
    { d: 'M4 11V8L7 5H17' },
    { d: 'M14 2 17 5 14 8' },
    { d: 'M20 13V16L17 19H7' },
    { d: 'M10 16 7 19 10 22' },
  ],
  // Linha em ascensão: progresso de PDL.
  progress: [
    { d: 'M4.5 3.5V20.5H20.5' },
    { d: 'M7 16 11 11 14 13.5 19.5 7' },
    { d: 'M15 6.5H20V11.5Z', fill: true },
  ],
  check: [{ d: 'M3.5 12.5 9.5 18.5 20.5 5.5' }],
  chat: [
    { d: 'M3.5 4.5H20.5V16.5H11L6.5 20.5V16.5H3.5Z' },
    { d: 'M8 10.5H16' },
  ],
  folder: [
    { d: 'M2.5 4.5H9.5L11.5 7H21.5V19.5H2.5Z' },
    { d: 'M2.5 10.5H21.5' },
  ],
  // Elo partido: cliente desconectado.
  unlinked: [
    { d: 'M9.5 7 12 4.5H19.5V12L17 14.5' },
    { d: 'M14.5 17 12 19.5H4.5V12L7 9.5' },
    { d: 'M9 15 15 9' },
    { d: 'M2 2 5 5M19 19 22 22' },
  ],
  // Elmo: jogador.
  user: [
    { d: 'M5 20.5V10.5L12 3.5 19 10.5V20.5L15 17.5H9Z' },
    { d: 'M8 11.5H16L14.5 14H9.5Z', fill: true },
  ],
};

@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden="true"
    >
      @for (shape of shapes(); track $index) {
        <path [attr.d]="shape.d" [attr.fill]="shape.fill ? 'currentColor' : 'none'" [attr.stroke]="shape.fill ? 'none' : null" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(20);
  protected readonly shapes = computed(() => ICONS[this.name()] ?? []);
}
