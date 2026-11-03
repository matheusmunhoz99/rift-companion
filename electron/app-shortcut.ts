import { globalShortcut } from 'electron';
import { appLog } from './app-log';

export const APP_SHORTCUT = 'CommandOrControl+Shift+R';

/**
 * Atalho global que mostra e esconde o app de qualquer lugar, também por cima do jogo
 * (sem Alt+Tab). Liga e desliga pela preferência; outro programa usando a mesma
 * combinação só faz o registro falhar (fica no log).
 */
export class AppShortcut {
  private registered = false;

  constructor(private readonly toggle: () => void) {}

  apply(enabled: boolean): void {
    if (enabled === this.registered) return;
    if (!enabled) {
      globalShortcut.unregister(APP_SHORTCUT);
      this.registered = false;
      return;
    }
    this.registered = globalShortcut.register(APP_SHORTCUT, () => this.toggle());
    if (!this.registered) appLog(`atalho ${APP_SHORTCUT} já está em uso por outro programa`);
  }

  dispose(): void {
    this.apply(false);
  }
}
