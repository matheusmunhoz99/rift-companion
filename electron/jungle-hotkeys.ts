import { globalShortcut } from 'electron';
import { appLog } from './app-log';
import type { LcuConnector } from './lcu/connector';

/**
 * Atalhos dentro da partida para marcar campos da selva sem sair do jogo (funcionam em tela
 * cheia). A API do jogo não avisa quando um campo morre; com o atalho o app conta até ele
 * voltar e a voz confirma. Só ficam registrados durante a partida, para não roubar as teclas
 * de outros programas no resto do tempo.
 */
export const JUNGLE_HOTKEYS: Array<{ accelerator: string; camp: string; label: string }> = [
  { accelerator: 'Control+Alt+1', camp: 'ally:blue', label: 'Seu azul' },
  { accelerator: 'Control+Alt+2', camp: 'ally:red', label: 'Seu vermelho' },
  { accelerator: 'Control+Alt+3', camp: 'enemy:blue', label: 'Azul inimigo' },
  { accelerator: 'Control+Alt+4', camp: 'enemy:red', label: 'Vermelho inimigo' },
  { accelerator: 'Control+Alt+5', camp: 'river:scuttle-top', label: 'Caranguejo de cima' },
  { accelerator: 'Control+Alt+6', camp: 'river:scuttle-bot', label: 'Caranguejo de baixo' },
];

const IN_GAME = new Set(['InProgress', 'Reconnect']);

export class JungleHotkeys {
  private registered = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly enabled: () => boolean,
    private readonly mark: (camp: string) => void,
  ) {
    connector.on('state', () => this.sync());
  }

  sync(): void {
    const want = this.enabled() && IN_GAME.has(this.connector.getState().gameflowPhase ?? '');
    if (want === this.registered) return;
    if (!want) {
      for (const hotkey of JUNGLE_HOTKEYS) globalShortcut.unregister(hotkey.accelerator);
      this.registered = false;
      return;
    }
    const failed = JUNGLE_HOTKEYS.filter((hotkey) => !globalShortcut.register(hotkey.accelerator, () => this.mark(hotkey.camp)));
    this.registered = true;
    if (failed.length) appLog(`atalhos da selva em uso por outro programa: ${failed.map((h) => h.accelerator).join(', ')}`);
  }

  dispose(): void {
    if (!this.registered) return;
    for (const hotkey of JUNGLE_HOTKEYS) globalShortcut.unregister(hotkey.accelerator);
    this.registered = false;
  }
}
