import { Component, inject } from '@angular/core';
import { PreferencesService } from '../core/preferences.service';
import { Icon } from '../ui/icon';
import { Switch } from '../ui/switch';

@Component({
  selector: 'app-settings-view',
  imports: [Switch, Icon],
  template: `
    <div class="settings">
      <section class="card">
        <h3 class="section-title">Geral</h3>
        <app-switch
          label="Aceitar partida automaticamente"
          description="Aceita a fila assim que a partida for encontrada. Se você recusar, nada é enviado."
          [checked]="prefs.preferences().autoAccept"
          (toggled)="prefs.set({ autoAccept: $event })"
        />
        <div class="divider"></div>
        <app-switch
          label="Abrir telas automaticamente"
          description="Vai para Seleção e Partida ao vivo quando elas começam."
          [checked]="prefs.preferences().autoNavigate"
          (toggled)="prefs.set({ autoNavigate: $event })"
        />
      </section>

      <section class="card">
        <h3 class="section-title">Overlay</h3>
        <app-switch
          label="Mostrar overlay durante a partida"
          description="Barra no topo da tela com tempo, KDA, CS por minuto, ouro, abates e objetivos."
          [checked]="prefs.preferences().overlayEnabled"
          (toggled)="prefs.set({ overlayEnabled: $event })"
        />
        <ul class="notes">
          <li>Use o jogo em modo <strong>Sem bordas</strong> (Configurações do jogo › Vídeo › Modo de janela).
            Em tela cheia exclusiva o Windows não deixa nada aparecer por cima.</li>
          <li>Mostrar/ocultar durante a partida: <code>{{ prefs.info()?.overlayShortcut ?? 'Ctrl+Shift+O' }}</code></li>
          <li>O overlay é uma janela separada: não injeta nada no jogo e usa só dados que o próprio jogo publica.</li>
        </ul>
      </section>

      <section class="card">
        <h3 class="section-title">Builds de itens</h3>
        <p class="muted">
          Você pode adicionar suas próprias builds em JSON na pasta do app. Elas aparecem junto com as de exemplo.
        </p>
        <button type="button" class="btn ghost" (click)="openBuildsFolder()">
          <app-icon name="folder" [size]="16" /> Abrir pasta de builds
        </button>
      </section>

      <section class="card">
        <h3 class="section-title">Sobre</h3>
        <p><strong>Rift Companion</strong> · versão beta {{ prefs.info()?.version }}</p>
        <p class="muted">
          Os dados da sua conta vêm do cliente do LoL no seu PC. Buscas de jogadores e partidas passam pelo
          servidor do Rift Companion, que consulta a Riot API. Nenhuma senha é lida ou enviada.
        </p>
        <p class="muted small">
          Rift Companion não é endossado pela Riot Games e não reflete as opiniões da Riot Games ou de qualquer
          pessoa envolvida na produção ou gestão de propriedades da Riot Games.
        </p>
      </section>
    </div>
  `,
  styles: `
    .settings {
      display: grid;
      gap: 18px;
      max-width: 760px;
    }
    .divider {
      height: 1px;
      margin: 14px 0;
      background: var(--border);
    }
    .notes {
      display: grid;
      gap: 6px;
      margin: 14px 0 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
    }
    p {
      margin: 0 0 12px;
    }
    .small {
      font-size: 11px;
    }
  `,
})
export class SettingsView {
  protected readonly prefs = inject(PreferencesService);

  protected openBuildsFolder(): void {
    void window.app?.openBuildsFolder();
  }
}
