import { app, ipcMain } from 'electron';
import path from 'node:path';
import type { LcuConnector } from '../lcu/connector';
import { lcuRequest } from '../lcu/http';
import { applyItemSet } from '../lcu/item-sets';
import { applyRunePage, getRecommendedRunePages, type RunePageSuggestion } from '../lcu/perks';
import { applySummonerSpells } from '../lcu/spells';
import { buildsForChampion, loadBuilds, type ItemBuild } from './library';

const SUMMONERS_RIFT = 11;

/** Pastas de builds: exemplos do app e, por cima, as builds do usuário. */
export function buildDirectories(): string[] {
  return [path.join(app.getAppPath(), 'builds'), path.join(app.getPath('userData'), 'builds')];
}

export function registerBuildHandlers(connector: LcuConnector): void {
  const requireCredentials = () => {
    const credentials = connector.getCredentials();
    if (!credentials) throw new Error('Cliente do LoL não conectado.');
    return credentials;
  };

  ipcMain.handle(
    'builds:get',
    async (_event, championId: number, position: string) => {
      const credentials = requireCredentials();
      const mapId = await currentMapId(connector);
      const [runePages, builds] = await Promise.all([
        getRecommendedRunePages(credentials, championId, position, mapId).catch(() => []),
        loadBuilds(buildDirectories()),
      ]);
      return {
        mapId,
        runePages,
        itemBuilds: buildsForChampion(builds, championId, position),
        buildsDirectory: buildDirectories()[1],
      };
    },
  );

  ipcMain.handle(
    'builds:apply-runes',
    async (_event, page: RunePageSuggestion, pageName: string, withSpells: boolean) => {
      const credentials = requireCredentials();
      const result = await applyRunePage(credentials, page, pageName);
      let spellsApplied = false;
      if (withSpells && connector.getState().gameflowPhase === 'ChampSelect') {
        await applySummonerSpells(credentials, page.summonerSpellIds);
        spellsApplied = true;
      }
      return { ...result, spellsApplied };
    },
  );

  ipcMain.handle(
    'builds:apply-items',
    async (_event, championId: number, build: ItemBuild) => {
      const credentials = requireCredentials();
      const summoner = connector.getState().summoner;
      if (!summoner) throw new Error('Perfil do jogador ainda não carregado.');
      return applyItemSet(credentials, summoner.summonerId, championId, build);
    },
  );
}

/** Mapa da fila atual (ex.: 12 = ARAM); fora de partida, Summoner's Rift. */
async function currentMapId(connector: LcuConnector): Promise<number> {
  const credentials = connector.getCredentials();
  if (!credentials || connector.getState().gameflowPhase === 'None') return SUMMONERS_RIFT;
  try {
    const session = await lcuRequest<{ map?: { id?: number } }>(
      credentials,
      'GET',
      '/lol-gameflow/v1/session',
    );
    return session.map?.id || SUMMONERS_RIFT;
  } catch {
    return SUMMONERS_RIFT;
  }
}
