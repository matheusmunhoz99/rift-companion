import { CapacitorHttp } from '@capacitor/core';
import type { SavedAccount } from '../lcu/lcu.types';

/**
 * Com o PC desligado, o celular busca direto no servidor do Rift Companion o que não
 * depende do LoL aberto: perfil, histórico, tier list, builds e estatísticas. As mesmas
 * rotas que o PC usa (electron/riot/ipc.ts), sem o histórico local do cliente do LoL.
 */
const API = 'https://rift-api.workscanner.com.br';

/** Espelha electron/riot/routing.ts (PLATFORMS). */
const PLATFORMS = [
  ['BR1', 'Brasil'], ['NA1', 'América do Norte'], ['LA1', 'América Latina Norte'], ['LA2', 'América Latina Sul'],
  ['EUW1', 'Europa Oeste'], ['EUN1', 'Europa Nórdica e Leste'], ['TR1', 'Turquia'], ['RU', 'Rússia'],
  ['ME1', 'Oriente Médio'], ['KR', 'Coreia'], ['JP1', 'Japão'], ['OC1', 'Oceania'], ['SG2', 'Singapura'],
  ['TW2', 'Taiwan'], ['VN2', 'Vietnã'],
].map(([id, label]) => ({ id, label }));

/** Região escolhida na tela de histórico enquanto o PC está desligado. */
let platformOverride: string | null = null;

async function get<T>(path: string, notFound?: string): Promise<T> {
  let response;
  try {
    response = await CapacitorHttp.request({ url: API + path, method: 'GET', connectTimeout: 10_000, readTimeout: 60_000, responseType: 'json' });
  } catch {
    throw new Error('Não foi possível conectar ao servidor de partidas. Verifique sua internet.');
  }
  if (response.status >= 200 && response.status < 300) return response.data as T;
  if (response.status === 404 && notFound) throw new Error(notFound);
  throw new Error((response.data as { error?: string } | null)?.error ?? `O servidor de partidas respondeu com erro ${response.status}.`);
}

const enc = encodeURIComponent;
const query = (entries: Record<string, string | number | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
};

type Handler = (account: SavedAccount | null, ...args: any[]) => Promise<unknown>;

export const DIRECT_CHANNELS: Record<string, Handler> = {
  'riot:get-settings': async (account) => ({ platformId: platformOverride ?? account?.platformId ?? 'BR1', platforms: PLATFORMS }),
  'riot:set-platform': async (_account, platformId: string) => {
    platformOverride = platformId;
  },
  'riot:find-player': (_account, gameName: string, tagLine: string, platformId: string) =>
    get(`/v1/players/${enc(platformId)}/${enc(gameName.trim())}/${enc(tagLine.trim().replace(/^#/, ''))}`, `Jogador ${gameName}#${tagLine} não encontrado.`),
  'riot:get-matches': (_account, puuid: string, platformId: string, start: number, count: number) =>
    get(`/v1/matches/${enc(platformId)}/${enc(puuid)}${query({ start, count })}`),
  'stats:meta': () => get('/v1/stats/meta'),
  'stats:tierlist': (_account, position: string | null) => get(`/v1/stats/tierlist${query({ position })}`),
  'stats:champion': (_account, championId: number, position: string | null, opponentId?: number | null, damage?: string | null) =>
    get(`/v1/stats/champion/${Number(championId)}${query({ position, vs: opponentId || null, damage })}`),
  'stats:counters': (_account, championId: number, position: string | null) =>
    get(`/v1/stats/counters/${Number(championId)}${query({ position })}`),
  'stats:damage': () => get('/v1/stats/damage').catch(() => ({})),
};
