import { Component, inject } from '@angular/core';
import { LiveDataService } from './live/live-data.service';
import { OverlayView } from './overlay/overlay-view';
import { Shell } from './shell/shell';
import { MobileLink } from './mobile/mobile-link';
import { isAndroid, phoneStatus } from './mobile/mobile-client';

/** Raiz: a janela principal mostra o shell; a do overlay (#overlay) só a barra do jogo. */
@Component({
  selector: 'app-root',
  imports: [Shell, OverlayView, MobileLink],
  template: `
    @if (android && status() !== 'online') {
      <main class="phone-welcome"><app-mobile-link /></main>
    } @else if (overlayMode) {
      <app-overlay-view />
    } @else {
      <app-shell />
    }
  `,
})
export class App {
  protected readonly android = isAndroid;
  protected readonly status = phoneStatus;
  protected readonly overlayMode = location.hash === '#overlay';

  constructor() {
    if (this.overlayMode) document.body.classList.add('overlay-mode');
    // Os dados ao vivo acumulam desde o início da partida, mesmo antes de abrir a aba.
    else if (!isAndroid) inject(LiveDataService);
  }
}
