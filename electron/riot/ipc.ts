import { diagEvent, diagHeaders, diagPath } from '../diagnostics';
import { app } from 'electron';
import { ipcMain } from '../mobile/rpc';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { LcuConnector } from '../lcu/connector';
import { lcuRequest } from '../lcu/http';
import { lanePosition } from '../overlay/lanes';
import { fetchRawGameData, toLocalPlayers } from '../overlay/live-client';
import { toLiveDashboard, type RawDashboardData } from '../overlay/live-dashboard';
import { createTimingsSource } from '../overlay/timings-source';
import type { Settings } from '../settings';
import { PLATFORMS } from './routing';
import { clientPartyQuery, readClientTeams, type ClientTeams } from './client-teams';
import { LocalHistory, mergePage, toSummary as toLocalSummary, type MatchSummary } from './local-history';
import { EncountersStore } from './encounters-store';

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
      // Mapa do próprio jogo (11 Rift, 12 Abismo Uivante...): sem ele o ARAM ganhava rotas.
      mapId: Number(raw.gameData?.mapNumber) || null,
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

  // Times como o cliente do LoL conhece: grupo de cada jogador (duo/trio com certeza), rota
  // e autofill. Não gasta a cota da Riot API.
  const clientTeams = async (): Promise<ClientTeams | null> => {
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_CLIENT_TEAMS;
    if (demo) return JSON.parse(readFileSync(demo, 'utf8')) as ClientTeams;
    return readClientTeams(connector.getCredentials());
  };
  ipcMain.handle('riot:get-client-teams', () => clientTeams());

  ipcMain.handle('riot:get-premades', async (_event, gameName: string, tagLine: string, platformId: string) => {
    // Só no desenvolvimento: grupos fictícios para revisar o visual.
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_PREMADES;
    if (demo) return JSON.parse(readFileSync(demo, 'utf8'));
    // O que o cliente do LoL já sabe vai junto: o servidor pula a análise dos times que
    // vierem completos (economiza ~20 requisições por partida) e guarda os grupos na memória.
    const query = clientPartyQuery(await clientTeams().catch(() => null));
    return apiGet<{
      groups: string[][];
      premades?: Array<{ puuids: string[]; size: number; confidence: number; source?: string }>;
      profiles?: Record<string, unknown>;
    }>(`/v1/premades/${enc(platformId)}/${enc(gameName)}/${enc(tagLine)}${query}`);
  });

  // Tela de carregamento: plano de jogo (IA + opções de build Mestre+). Falha -> null.
  ipcMain.handle('riot:get-plan', (_event, request: unknown) => {
    // Só no desenvolvimento: plano gravado para revisar o visual sem gastar a IA.
    const demo = app.isPackaged ? undefined : process.env.RIFT_DEMO_PLAN;
    if (demo) return JSON.parse(readFileSync(demo, 'utf8'));
    return apiPost('/v1/plan', request).catch(() => null);
  });
  // Partida em andamento: leitura por IA (situação + opções para você escolher). Falha -> null.
  ipcMain.handle('riot:get-live-read', (_event, request: unknown) => apiPost('/v1/live-read', request).catch(() => null));

  // Fim de jogo: manda os fatos calculados no app e recebe timeline + narração por IA.
  ipcMain.handle('riot:get-coach', (_event, request: unknown) =>
    apiPost('/v1/coach', request).catch(() => ({ timeline: null, narration: null })),
  );

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
  // Guarda localmente as SUAS partidas (dedup) para o "com quem já joguei" crescer além de 20, sem API extra.
  const encounters = new EncountersStore(nodePath.join(app.getPath('userData'), 'encounters.json'));
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
        const merged = mergePage(page, local, upper, page.length >= count);
        encounters.remember(merged);
        return merged;
      } catch {
        encounters.remember(page);
        return page;
      }
    },
  );

  // Todas as suas partidas guardadas (enxutas), para cruzar o "com quem já joguei" com muito mais que 20.
  ipcMain.handle('riot:remembered-matches', () => encounters.list());

  // Série por minuto (ouro/XP/CS/nível dos 10) para os gráficos do fim de jogo. Só Riot API (sem IA).
  // A timeline da Riot sai alguns segundos depois da partida: enquanto não há, o servidor dá 404
  // e isto devolve null para a tela tentar de novo.
  ipcMain.handle('riot:get-match-timeline', (_event, platformId: string, matchId: string) =>
    apiGet<unknown>(`/v1/matches/${enc(platformId)}/${enc(matchId)}/timeline`).catch(() => null),
  );
}

async function apiGet<T>(path: string, notFoundMessage?: string): Promise<T> {
  let response: Response;
  const started = Date.now();
  try {
    response = await fetch(RIFT_API_URL + path, { headers: diagHeaders(), signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    traceApi('GET', path, 0, started, error);
    throw new Error('Não foi possível conectar ao servidor de partidas. Verifique sua internet.');
  }
  traceApi('GET', path, response.status, started);

  if (response.ok) return (await response.json()) as T;
  if (response.status === 404 && notFoundMessage) throw new Error(notFoundMessage);

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `O servidor de partidas respondeu com erro ${response.status}.`);
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  let response: Response;
  const started = Date.now();
  try {
    response = await fetch(RIFT_API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...diagHeaders() },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    traceApi('POST', path, 0, started, error);
    throw new Error('Não foi possível conectar ao servidor de partidas. Verifique sua internet.');
  }
  traceApi('POST', path, response.status, started);
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `O servidor de partidas respondeu com erro ${response.status}.`);
}

/** Diagnóstico detalhado: cada pedido ao servidor visto do lado do app (inclui timeouts). */
function traceApi(method: string, path: string, status: number, started: number, error?: unknown): void {
  // Estatísticas (tier list, builds) não ajudam a achar falha de partida e enchem o registro.
  if (path.startsWith('/v1/stats')) return;
  diagEvent('api', {
    status,
    ms: Date.now() - started,
    detail: {
      metodo: method,
      caminho: diagPath(path.split('?')[0]),
      ...(error ? { erro: error instanceof Error ? `${error.name}: ${error.message}` : String(error) } : {}),
    },
  });
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
