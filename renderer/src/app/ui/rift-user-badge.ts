import { Component } from '@angular/core';

/** Selo ao lado do nick de quem também usa o Rift Companion (a marca do app em miniatura). */
@Component({
  selector: 'app-rift-user-badge',
  template: `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1.8 28.3 8.9V23.1L16 30.2 3.7 23.1V8.9Z" />
      <path class="core" d="M16 6.5 23 16 16 25.5 9 16Z" />
    </svg>
  `,
  host: { role: 'img', 'aria-label': 'Usa o Rift Companion', title: 'Usa o Rift Companion' },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.15em;
      height: 1.15em;
      vertical-align: -0.18em;
      filter: drop-shadow(0 0 4px rgb(255 106 61 / 45%));
    }
    svg {
      width: 100%;
      height: 100%;
    }
    path {
      fill: #141821;
      stroke: var(--accent);
      stroke-width: 2.2;
    }
    path.core {
      fill: var(--accent);
      stroke: none;
    }
  `,
})
export class RiftUserBadge {}
