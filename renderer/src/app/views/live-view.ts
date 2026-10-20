import { Component, computed, inject } from '@angular/core';
import { PreferencesService } from '../core/preferences.service';
import { LcuService } from '../lcu/lcu.service';
import { LiveGameView } from '../live/live-game-view';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-live-view',
  imports: [LiveGameView, Icon],
  template: `
    @if (inGame()) {
      <!-- Sem cartão em volta: a partida usa a janela inteira. -->
      <app-live-game-view />
    } @else {
      <section class="card">
        <div class="empty-state">
          <app-icon name="live" [size]="36" />
          <h2>Nenhuma partida em andamento</h2>
          <p>
            Quando a partida começar, esta tela mostra os dois times com elo, maestria, histórico
            recente de cada jogador e a chance de vitória.
          </p>
          @if (prefs.preferences().overlayEnabled) {
            <p class="hint">
              O overlay aparece no topo do jogo em modo <strong>sem bordas</strong>.
              Mostrar/ocultar: <code>{{ prefs.info()?.overlayShortcut ?? 'Ctrl+Shift+O' }}</code>
            </p>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .hint {
      font-size: 12px;
    }
  `,
})
export class LiveView {
  private readonly lcu = inject(LcuService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly inGame = computed(() => {
    const phase = this.lcu.state().gameflowPhase;
    return phase === 'InProgress' || phase === 'Reconnect';
  });
}
