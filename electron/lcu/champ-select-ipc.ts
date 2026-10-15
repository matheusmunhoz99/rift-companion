import { ipcMain } from 'electron';
import {
  pickChampion,
  rerollChampion,
  respondTrade,
  swapWithBench,
  type TradeAction,
} from './champ-select';
import type { LcuConnector } from './connector';

const TRADE_ACTIONS: TradeAction[] = ['request', 'accept', 'decline'];

export function registerChampSelectHandlers(connector: LcuConnector): void {
  const credentials = () => {
    const current = connector.getCredentials();
    if (!current) throw new Error('Cliente do LoL não conectado.');
    if (connector.getState().gameflowPhase !== 'ChampSelect') {
      throw new Error('Você não está na seleção de campeões.');
    }
    return current;
  };

  ipcMain.handle('champ-select:pick', (_event, championId: number) =>
    pickChampion(credentials(), toId(championId)),
  );

  ipcMain.handle('champ-select:bench-swap', (_event, championId: number) =>
    swapWithBench(credentials(), toId(championId)),
  );

  ipcMain.handle('champ-select:reroll', () => rerollChampion(credentials()));

  ipcMain.handle('champ-select:trade', (_event, tradeId: number, action: TradeAction) => {
    if (!TRADE_ACTIONS.includes(action)) throw new Error('Ação de troca inválida.');
    return respondTrade(credentials(), toId(tradeId), action);
  });
}

function toId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador inválido.');
  return id;
}
