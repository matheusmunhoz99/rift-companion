import { ipcMain } from '../mobile/rpc';
import type { LcuConnector } from './connector';
import {
  cancelSearch,
  createLobby,
  getAvailableChampions,
  getFriends,
  getQueues,
  inviteFriend,
  leaveLobby,
  respondReadyCheck,
  setPlayerSlot,
  setPositions,
  startSearch,
  type Position,
} from './lobby';

export function registerLobbyHandlers(connector: LcuConnector): void {
  const credentials = () => {
    const current = connector.getCredentials();
    if (!current) throw new Error('Cliente do LoL não conectado.');
    return current;
  };

  ipcMain.handle('lobby:queues', () => getQueues(credentials()));
  ipcMain.handle('lobby:friends', () => getFriends(credentials()));
  ipcMain.handle('lobby:create', (_event, queueId: number) => createLobby(credentials(), toId(queueId)));
  ipcMain.handle('lobby:leave', () => leaveLobby(credentials()));
  ipcMain.handle('lobby:positions', (_event, first: Position, second: Position) =>
    setPositions(credentials(), first, second),
  );
  ipcMain.handle('lobby:search', (_event, start: boolean) =>
    start ? startSearch(credentials()) : cancelSearch(credentials()),
  );
  ipcMain.handle('lobby:invite', (_event, summonerId: number) =>
    inviteFriend(credentials(), toId(summonerId)),
  );
  ipcMain.handle('lobby:champions', () => getAvailableChampions(credentials()));
  ipcMain.handle('lobby:slot', (_event, index: number, championId: number, position: string) =>
    setPlayerSlot(credentials(), Number(index), toId(championId), String(position)),
  );
  ipcMain.handle('lobby:ready-check', (_event, accept: boolean) =>
    respondReadyCheck(credentials(), accept === true),
  );
}

function toId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador inválido.');
  return id;
}
