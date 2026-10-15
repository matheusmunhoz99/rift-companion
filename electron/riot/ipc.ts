import { ipcMain } from 'electron';
import type { LcuConnector } from '../lcu/connector';
import type { Settings } from '../settings';
import { PLATFORMS } from './routing';

/** Servidor que guarda a chave da Riot (server/). Pode ser trocado em desenvolvimento. */
const RIFT_API_URL = process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br';

export function registerRiotHandlers(settings: Settings, connector: LcuConnector): void {
  ipcMain.handle('riot:get-settings', () => ({
    platformId: settings.getPlatformId() ?? connector.getState().platformId ?? 'BR1',
    platforms: PLATFORMS.map(({ id, label }) => ({ id, label })),
  }));

  ipcMain.handle('riot:set-platform', (_event, platformId: string) => {
    settings.setPlatformId(platformId);
  });

  ipcMain.handle(
    'riot:find-player',
    (_event, gameName: string, tagLine: string, platformId: string) =>
      apiGet(
        `/v1/players/${enc(platformId)}/${enc(gameName.trim())}/${enc(tagLine.trim().replace(/^#/, ''))}`,
        `Jogador ${gameName}#${tagLine} não encontrado.`,
      ),
  );

  ipcMain.handle(
    'riot:get-matches',
    (_event, puuid: string, platformId: string, start: number, count: number) =>
      apiGet(`/v1/matches/${enc(platformId)}/${enc(puuid)}?start=${start}&count=${count}`),
  );
}

async function apiGet<T>(path: string, notFoundMessage?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(RIFT_API_URL + path, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error('Não foi possível conectar ao servidor de partidas. Verifique sua internet.');
  }

  if (response.ok) return (await response.json()) as T;
  if (response.status === 404 && notFoundMessage) throw new Error(notFoundMessage);

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `O servidor de partidas respondeu com erro ${response.status}.`);
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
