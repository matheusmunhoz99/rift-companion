import { Component } from '@angular/core';
import { OverlayView } from './overlay/overlay-view';
import { Shell } from './shell/shell';

/** Raiz: a janela principal mostra o shell; a do overlay (#overlay) só a barra do jogo. */
@Component({
  selector: 'app-root',
  imports: [Shell, OverlayView],
  template: `
    @if (overlayMode) {
      <app-overlay-view />
    } @else {
      <app-shell />
    }
  `,
})
export class App {
  protected readonly overlayMode = location.hash === '#overlay';

  constructor() {
    if (this.overlayMode) document.body.classList.add('overlay-mode');
  }
}
