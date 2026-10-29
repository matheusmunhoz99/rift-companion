import { signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface GameWatchPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const plugin = registerPlugin<GameWatchPlugin>('RiftGameWatch');
const KEY = 'rift.gameWatch';
const android = Capacitor.getPlatform() === 'android';

/**
 * Aviso no celular quando a partida carrega e quando começa, com o app fechado.
 * Ligado por padrão; a escolha fica no próprio celular.
 */
export const gameWatchEnabled = signal(readEnabled());
export const gameWatchError = signal('');

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Liga o vigia (com o celular vinculado e a opção ligada) ou desliga. */
export async function syncGameWatch(linked: boolean): Promise<void> {
  if (!android) return;
  try {
    if (linked && gameWatchEnabled()) await plugin.start();
    else await plugin.stop();
    gameWatchError.set('');
  } catch (error) {
    gameWatchError.set(error instanceof Error ? error.message : 'Não foi possível ligar o aviso de partida.');
  }
}

export async function setGameWatch(enabled: boolean, linked: boolean): Promise<void> {
  gameWatchEnabled.set(enabled);
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // Sem armazenamento: vale até fechar o app.
  }
  await syncGameWatch(linked);
}
