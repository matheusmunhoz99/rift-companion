import { Component, computed, inject, signal } from '@angular/core';
import { LiveDataService } from './live/live-data.service';
import { OverlayView } from './overlay/overlay-view';
import { Shell } from './shell/shell';
import { MobileLink } from './mobile/mobile-link';
import { isAndroid, phoneStatus, savedAccount } from './mobile/mobile-client';

/** Raiz: a janela principal mostra o shell; a do overlay (#overlay) só a barra do jogo. */
@Component({
  selector: 'app-root',
  imports: [Shell, OverlayView, MobileLink],
  template: `
    @if (android && status() !== 'online' && !browseOffline()) {
      <main class="phone-welcome"><app-mobile-link /></main>
    } @else if (overlayMode) {
      <app-overlay-view />
    } @else {
      @if (android && status() !== 'online') {
        <!-- PC desligado: perfil, histórico e estatísticas continuam (direto do servidor). -->
        <div class="pc-offline" role="status">
          <span class="dot"></span>
          <span>PC desligado. Seu perfil, histórico e builds continuam aqui; fila e seleção voltam quando o PC ligar.</span>
          <button type="button" (click)="showLink.set(true)">Conexão</button>
        </div>
      }
      <app-shell />
    }
  `,
  styles: `
    .pc-offline {
      position: sticky;
      top: env(safe-area-inset-top, 0px);
      z-index: 40;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px max(14px, env(safe-area-inset-right, 0px)) 8px max(14px, env(safe-area-inset-left, 0px));
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .dot {
      flex: none;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--warning);
    }
    button {
      flex: none;
      margin-left: auto;
      padding: 5px 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text);
      font: inherit;
      font-weight: 600;
    }
  `,
})
export class App {
  protected readonly android = isAndroid;
  protected readonly status = phoneStatus;
  protected readonly overlayMode = location.hash === '#overlay';
  /** Mostra a tela de conexão mesmo com a conta lembrada (botão "Conexão"). */
  protected readonly showLink = signal(false);
  /** PC desligado, mas o celular já conhece sua conta: abre o app em vez da tela de conexão. */
  protected readonly browseOffline = computed(() => this.status() === 'offline' && !!savedAccount() && !this.showLink());

  constructor() {
    if (this.overlayMode) document.body.classList.add('overlay-mode');
    // Os dados ao vivo acumulam desde o início da partida, mesmo antes de abrir a aba.
    else if (!isAndroid) inject(LiveDataService);
  }
}
