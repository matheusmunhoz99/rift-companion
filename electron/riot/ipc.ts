import { app } from 'electron';
import { ipcMain } from '../mobile/rpc';
import { readFileSync } from 'node:fs';
import type { LcuConnector } from '../lcu/connector';
import { lcuRequest } from '../lcu/http';
import { lanePosition } from '../overlay/lanes';
import { fetchRawGameData, toLocalPlayers } from '../overlay/live-client';
import { toLiveDashboard, type RawDashboardData } from '../overlay/live-dashboard';
import { createTimingsSource } from '../overlay/timings-source';
import type { Settings } from '../settings';
import { PLATFORMS } from './routing';
import { LocalHistory, mergePage, toSummary as toLocalSummary, type MatchSummary } from './local-history';

/** Servidor que guarda a chave da Riot (server/). Pode ser trocado em desenvolvimento. */
export const RIFT_API_URL = process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br';

export function registerRiotHandlers(settings: Settings, connector: LcuConnector): void {
  const timings = createTimingsSource(connector, app.isPackaged);

  ipcMain.handle('riot:get-settings', () => ({
    platformId: settings.getPlatformId() ?? connector.getState().platformId ?? 'BR1',
    platforms: PLATFORMS.map(({ id, label }) => ({ id, label })),
  }));

  ipcMain.handle('riot:set-platform', (_event, platformId: string) => {
    settings.setPlatformId(platformId);
  });

  ipcMain.handle(
    'riot:find-player',
    (_event, gameName: string, tagLine: string, platformId: string) => {
      // Só no desenvolvimento: perfis fictícios (por nome) para revisar os cards dos aliados.
      const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_PLAYERS;
      if (demo) {
        const byName = JSON.parse(readFileSync(demo, 'utf8')) as Record<string, unknown>;
        const profile = byName[gameName.toLowerCase()];
        if (profile) return profile;
        throw new Error(`Jogador ${gameName}#${tagLine} não encontrado.`);
      }
      return apiGet(
        `/v1/players/${enc(platformId)}/${enc(gameName.trim())}/${enc(tagLine.trim().replace(/^#/, ''))}`,
        `Jogador ${gameName}#${tagLine} não encontrado.`,
      );
    },
  );

  ipcMain.handle(
    'riot:get-live-game',
    (_event, gameName: string, tagLine: string, platformId: string) => {
      // Só no desenvolvimento: partida gravada para revisar o visual sem estar jogando.
      const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_LIVE;
      if (demo) return JSON.parse(readFileSync(demo, 'utf8'));
      return apiGet(
        `/v1/live/${enc(platformId)}/${enc(gameName)}/${enc(tagLine)}`,
        'Você não está em partida.',
      );
    },
  );

  // Partida pelos dados locais do jogo: aparece na hora, antes da Riot API liberar a partida.
  ipcMain.handle('riot:get-local-game', async () => {
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_LOCAL;
    const raw = demo ? JSON.parse(readFileSync(demo, 'utf8')) : await fetchRawGameData();
    if (!raw?.allPlayers?.length) return null;
    const credentials = connector.getCredentials();
    type SessionPlayer = { championId?: number; selectedPosition?: string };
    const session = credentials
      ? await lcuRequest<{ gameData?: { queue?: { id?: number }; teamOne?: SessionPlayer[]; teamTwo?: SessionPlayer[] } }>(
          credentials, 'GET', '/lol-gameflow/v1/session',
        ).catch(() => null)
      : null;
    // Rotas escolhidas na seleção; às vezes faltam jogadores. teamOne é o time azul (100).
    // O time entra na chave porque a Partida Rápida permite o mesmo campeão nos dois lados.
    const championPositions = (['teamOne', 'teamTwo'] as const).flatMap((team) =>
      (session?.gameData?.[team] ?? [])
        .map((p) => ({ teamId: team === 'teamOne' ? 100 : 200, championId: p.championId ?? 0, position: lanePosition(p.selectedPosition) }))
        .filter((p) => p.championId > 0 && p.position),
    );
    return {
      queueId: session?.gameData?.queue?.id ?? 0,
      gameStartTime: Date.now() - Math.round((raw.gameData?.gameTime ?? 0) * 1000),
      players: toLocalPlayers(raw),
      championPositions,
    };
  });

  // Painel ao vivo (timers, objetivos, placar, seus atributos), direto do jogo.
  ipcMain.handle('riot:get-live-dashboard', async () => {
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_LOCAL;
    const raw = demo ? JSON.parse(readFileSync(demo, 'utf8')) : await fetchRawGameData();
    if (!raw?.allPlayers?.length) return null;
    return toLiveDashboard(raw as RawDashboardData, await timings());
  });

  ipcMain.handle('riot:get-premades', (_event, gameName: string, tagLine: string, platformId: string) => {
    // Só no desenvolvimento: grupos fictícios para revisar o visual.
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_PREMADES;
    if (demo) return JSON.parse(readFileSync(demo, 'utf8'));
    return apiGet<{ groups: string[][] }>(`/v1/premades/${enc(platformId)}/${enc(gameName)}/${enc(tagLine)}`);
  });

  ipcMain.handle('stats:meta', () => apiGet('/v1/stats/meta'));
  ipcMain.handle('stats:tierlist', (_event, position: string | null) =>
    apiGet(`/v1/stats/tierlist${position ? `?position=${enc(position)}` : ''}`),
  );
  ipcMain.handle(
    'stats:champion',
    (_event, championId: number, position: string | null, opponentId?: number | null, damage?: string | null) => {
    const query = new URLSearchParams();
    if (position) query.set('position', position);
    if (opponentId) query.set('vs', String(Number(opponentId)));
    if (damage && ['ap', 'ad', 'mixed'].includes(damage)) query.set('damage', damage);
    const suffix = query.toString() ? `?${query}` : '';
    return apiGet(`/v1/stats/champion/${Number(championId)}${suffix}`);
    },
  );

  // Servidor antigo (sem a rota) responde 404: fica sem dados reais e o app usa a estimativa.
  ipcMain.handle('stats:damage', () => apiGet('/v1/stats/damage').catch(() => ({})));

  ipcMain.handle('stats:counters', (_event, championId: number, position: string | null) => {
    const query = position ? `?position=${enc(position)}` : '';
    return apiGet(`/v1/stats/counters/${Number(championId)}${query}`);
  });

  // A API da Riot não entrega alguns modos (ex.: ARAM: Desordem, fila 2400). Para o
  // jogador logado, completa com o histórico do próprio cliente do LoL.
  const localHistory = new LocalHistory();
  const myApiPuuid = new Map<string, string>();
  const apiPuuidOfMe = async (platformId: string): Promise<string | null> => {
    const me = connector.getState().summoner;
    if (!me?.gameName) return null;
    const key = `${platformId}:${me.gameName}#${me.tagLine}`.toLowerCase();
    const known = myApiPuuid.get(key);
    if (known) return known;
    const profile = await apiGet<{ puuid?: string }>(
      `/v1/players/${enc(platformId)}/${enc(me.gameName)}/${enc(me.tagLine)}`,
    ).catch(() => null);
    if (profile?.puuid) myApiPuuid.set(key, profile.puuid);
    return profile?.puuid ?? null;
  };

  ipcMain.handle(
    'riot:get-matches',
    async (_event, puuid: string, platformId: string, start: number, count: number) => {
      const path = (s: number, c: number) => `/v1/matches/${enc(platformId)}/${enc(puuid)}?start=${s}&count=${c}`;
      const page = await apiGet<MatchSummary[]>(path(start, count));
      const credentials = connector.getCredentials();
      const me = connector.getState().summoner;
      if (!credentials || !me || (await apiPuuidOfMe(platformId)) !== puuid) return page;
      try {
        // Fim da partida logo antes desta página: limita as partidas do cliente que entram aqui.
        const before = start > 0 ? (await apiGet<MatchSummary[]>(path(start - 1, 1)))[0] : undefined;
        const upper = before?.gameEndTimestamp ?? Infinity;
        const known = new Set(page.map((m) => m.matchId));
        const lower = page.length >= count && page.length ? page[page.length - 1].gameEndTimestamp : -Infinity;
        const games = (await localHistory.recent(credentials)).filter((g) => {
          const end = g.gameCreation + g.gameDuration * 1000;
          return !known.has(`${g.platformId}_${g.gameId}`) && end < upper && end >= lower;
        });
        const local = (await Promise.all(games.map((g) => localHistory.game(credentials, g.gameId))))
          .map((g) => (g ? toLocalSummary(g, me.puuid, puuid) : null))
          .filter((m): m is MatchSummary => m !== null);
        return mergePage(page, local, upper, page.length >= count);
      } catch {
        return page;
      }
    },
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
