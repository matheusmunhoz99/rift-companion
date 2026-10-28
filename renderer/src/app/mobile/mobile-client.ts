import { signal } from '@angular/core';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { LcuState } from '../lcu/lcu.types';
import type { Preferences, AppInfo } from '../core/app.types';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const phoneStatus = signal<'unlinked' | 'waiting' | 'offline' | 'online'>('unlinked');
export const phoneError = signal('');
const BASE = 'https://rift-api.workscanner.com.br/v1/mobile/';
const credentials = registerPlugin<{ get(): Promise<{ token?: string }>; set(value: { token: string }): Promise<void>; remove(): Promise<void> }>('RiftCredentials');
let token: string | null = null;
let generation = 0;
let running = false;
const listeners = new Map<string, Set<(value: any) => void>>();
const emptyState: LcuState = { status: 'waiting-client', summoner: null, gameflowPhase: null, champSelect: null,
  platformId: null, lobby: null, search: null, readyCheck: null };
type Snapshot = { lcu: LcuState; prefs: Preferences; info: AppInfo; postgame: unknown };
let snapshot: Snapshot | null = null;

function subscribe(event: string, callback: (value: any) => void): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(callback); listeners.set(event, set);
  return () => set.delete(callback);
}
function emit(event: string, value: unknown): void { for (const callback of listeners.get(event) ?? []) callback(value); }

async function api<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await CapacitorHttp.request({
    url: BASE + endpoint,
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    data: body, connectTimeout: 10_000, readTimeout: 25_000, responseType: 'json',
  });
  const data = response.data;
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401) {
      token = null; snapshot = null; generation++;
      phoneStatus.set('unlinked');
      await credentials.remove();
    }
    throw new Error(data.error ?? 'Não foi possível conectar ao PC.');
  }
  return data as T;
}

export function parsePairCode(text: string): string {
  const url = new URL(text.trim());
  const code = url.searchParams.get('code');
  if (url.protocol !== 'rift-companion:' || url.hostname !== 'pair' || url.searchParams.get('v') !== '1' || !code || !/^[a-f0-9]{64}$/.test(code))
    throw new Error('Este QR Code não é do Rift Companion. Gere um em Configurações no PC.');
  return code;
}

export async function pairPhone(text: string, name: string): Promise<void> {
  const code = parsePairCode(text);
  if (token) throw new Error('Desvincule o PC atual antes de conectar outro.');
  const result = await api<{ token: string }>('claim', { code, name: name.trim() || 'Meu Android' });
  await credentials.set({ token: result.token });
  token = result.token; generation++;
  phoneStatus.set('waiting'); phoneError.set('');
  void poll();
}

export async function unlinkPhone(): Promise<void> {
  // Do not pretend revocation succeeded if the relay could not be reached.
  if (token) await api('unlink', {});
  await credentials.remove();
  token = null; snapshot = null; generation++;
  phoneStatus.set('unlinked'); phoneError.set('');
  emit('lcu:state', emptyState);
}

async function poll(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (token) {
      const requestGeneration = generation;
      try {
        const state = await api<{ approved: boolean; online: boolean; data: Snapshot | null }>('state');
        if (generation !== requestGeneration) continue;
        if (!state.approved) phoneStatus.set('waiting');
        else if (!state.online || !state.data) { phoneStatus.set('offline'); snapshot = null; emit('lcu:state', emptyState); }
        else {
          const previous = snapshot;
          snapshot = state.data;
          phoneStatus.set('online'); phoneError.set('');
          emit('lcu:state', snapshot.lcu);
          if (JSON.stringify(previous?.prefs) !== JSON.stringify(snapshot.prefs)) emit('prefs:changed', snapshot.prefs);
          if (JSON.stringify(previous?.postgame) !== JSON.stringify(snapshot.postgame)) emit('postgame:ready', snapshot.postgame);
        }
      } catch (error) {
        if (token) { phoneStatus.set('offline'); snapshot = null; emit('lcu:state', emptyState); }
        phoneError.set(error instanceof Error ? error.message : 'Sem conexão.');
      }
      await new Promise(resolve => setTimeout(resolve, document.hidden ? 5_000 : 1_000));
    }
  } finally { running = false; }
}

async function call(channel: string, ...args: unknown[]): Promise<any> {
  if (!token || phoneStatus() !== 'online') throw new Error('Abra o Rift Companion no PC e confira a conexão.');
  const current = generation;
  const result = await api<{ value?: unknown; error?: string }>('call', { channel, args, phase: snapshot?.lcu.gameflowPhase ?? null });
  if (generation !== current) throw new Error('O vínculo mudou.');
  if (result.error) throw new Error(result.error);
  return result.value;
}
const methods = (mapping: Record<string, string>) => Object.fromEntries(Object.entries(mapping).map(([name, channel]) => [name, (...args: unknown[]) => call(channel, ...args)]));
const on = (event: string) => (callback: (value: any) => void) => subscribe(event, callback);
const localOnly = async () => { throw new Error('Use esta configuração diretamente no Rift Companion do Windows.'); };

/** Reuses every existing screen, replacing only Electron's preload transport. */
export function initializeAndroid(): void {
  if (!isAndroid) return;
  document.body.classList.add('android-app');
  Object.assign(window, {
    lcu: { getState: async () => snapshot?.lcu ?? emptyState, onState: on('lcu:state') },
    app: {
      ...methods({ setPreferences: 'prefs:set', launchLeague: 'app:launch-league', gameWindowMode: 'app:game-window-mode' }),
      getPreferences: async () => { if (!snapshot) throw new Error('PC desconectado.'); return snapshot.prefs; },
      info: async () => { if (!snapshot) throw new Error('PC desconectado.'); return snapshot.info; },
      updateStatus: async () => ({ state: 'idle' }), checkUpdate: localOnly, installUpdate: localOnly, openBuildsFolder: localOnly,
      onPreferencesChanged: on('prefs:changed'), onAutoAccepted: on('auto-accept:accepted'),
      onAutoRunesApplied: on('auto-runes:applied'), onOverlayData: on('overlay:data'), onUpdateStatus: on('update:status'),
    },
    lobby: methods({ queues: 'lobby:queues', friends: 'lobby:friends', create: 'lobby:create', leave: 'lobby:leave',
      setPositions: 'lobby:positions', search: 'lobby:search', invite: 'lobby:invite', readyCheck: 'lobby:ready-check',
      champions: 'lobby:champions', setSlot: 'lobby:slot' }),
    champSelect: methods({ pick: 'champ-select:pick', ban: 'champ-select:ban', benchSwap: 'champ-select:bench-swap', reroll: 'champ-select:reroll', trade: 'champ-select:trade' }),
    riot: {
      ...methods({ getSettings: 'riot:get-settings', setPlatform: 'riot:set-platform', findPlayer: 'riot:find-player',
        getLiveGame: 'riot:get-live-game', getLocalGame: 'riot:get-local-game', getLiveDashboard: 'riot:get-live-dashboard',
        getPremades: 'riot:get-premades', getMatches: 'riot:get-matches' }),
      getPostGame: async () => snapshot?.postgame ?? null, onPostGame: on('postgame:ready'),
    },
    stats: methods({ meta: 'stats:meta', tierList: 'stats:tierlist', champion: 'stats:champion', counters: 'stats:counters', damage: 'stats:damage' }),
    riftUsers: methods({ lookup: 'users:lookup' }),
    builds: methods({ get: 'builds:get', applyRunes: 'builds:apply-runes', applyItems: 'builds:apply-items' }),
    telegram: { ...methods({ status: 'telegram:status' }), connect: localOnly, cancel: localOnly, disconnect: localOnly, test: localOnly },
  });
  void credentials.get().then(result => {
    if (result.token) { token = result.token; phoneStatus.set('offline'); void poll(); }
  }).catch(() => phoneError.set('Não foi possível abrir o vínculo seguro. Vincule novamente.'));

  // Procura uma versão nova do APK (import tardio para não pesar o início).
  void import('./android-update').then((m) => m.checkAndroidUpdate());
}
