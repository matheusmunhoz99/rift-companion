import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LcuCredentials } from './credentials';
import { LcuHttpError, lcuRequest } from './http';

const LOCKFILE = path.join(process.env.LOCALAPPDATA ?? '', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
const INSTALLS = 'C:/ProgramData/Riot Games/RiotClientInstalls.json';
const RIOT_CLIENT_FALLBACK = 'C:/Riot Games/Riot Client/RiotClientServices.exe';
const LAUNCH_ARGS = ['--launch-product=league_of_legends', '--launch-patchline=live'];
const execFileAsync = promisify(execFile);
let launching: Promise<LeagueLaunchResult> | null = null;
/**
 * Riot Client iniciado por este app com o proxy (o Windows nem sempre expõe a linha
 * de comando). Guarda todos os PIDs vistos logo depois de abrir: o RiotClientServices
 * costuma se reabrir com outro PID nos primeiros segundos.
 */
let proxiedLaunch: { pids: number[]; url: string } | null = null;
const SPAWN_CONFIRM_MS = 12_000;
const SPAWN_WATCH_MS = 25_000;

/**
 * restarted: o LoL estava aberto sem o modo invisível e foi reaberto pelo proxy;
 * waiting: idem, mas numa partida (reabre quando ela acabar); declined: o usuário preferiu não reiniciar.
 */
export type LeagueLaunchResult =
  | 'riot-client' | 'already-open' | 'started' | 'restart-required' | 'restarted' | 'waiting' | 'declined' | null;

/**
 * Abre o League of Legends. Com o Riot Client já aberto (ex.: depois de fechar só o
 * LoL), pede pela API local dele; rodar o .exe de novo não repassa o pedido para a
 * instância aberta. Com o Riot Client fechado, abre o .exe já mandando abrir o LoL.
 * Se a conta não estiver salva, o Riot Client mostra o login no PC.
 */
export async function launchLeague(clientConfigUrl?: string, proxyInUse = false): Promise<LeagueLaunchResult> {
  if (launching) return launching;
  launching = launch(clientConfigUrl, proxyInUse);
  try {
    return await launching;
  } finally {
    launching = null;
  }
}

async function launch(clientConfigUrl: string | undefined, proxyInUse: boolean): Promise<LeagueLaunchResult> {
  // Um lockfile pode faltar durante a inicialização ou estar obsoleto. Consulta
  // o processo real e permite reabrir o LoL quando este Riot Client já usa o proxy.
  const running = clientConfigUrl ? await readRiotProcesses() : [];
  if (clientConfigUrl && running.some((entry) => !usesConfig(entry, clientConfigUrl, proxyInUse))) {
    return 'restart-required';
  }
  const credentials = readLockfile();
  if (credentials && (!clientConfigUrl || running.some((entry) => entry.ProcessId === credentials.pid))) {
    try {
      await lcuRequest(credentials, 'POST', '/product-launcher/v1/products/league_of_legends/patchlines/live');
      return 'riot-client';
    } catch (error) {
      // 423 already_launched: o LoL já está aberto (ou abrindo).
      if (error instanceof LcuHttpError && error.status === 423) return 'already-open';
      if (running.length) throw new Error('O Riot Client ainda não respondeu. Aguarde alguns segundos e tente novamente.');
      // Outro erro: lockfile antigo (Riot Client fechado sem apagar); tenta pelo .exe.
    }
  }
  if (running.length) return 'already-open';

  const exe = riotClientPath();
  if (!exe) return null;
  const args = clientConfigUrl
    ? [`--client-config-url=${clientConfigUrl}`, ...LAUNCH_ARGS, '--allow-direct-launch']
    : LAUNCH_ARGS;
  // Logo depois de fechar o Riot Client, a instância nova às vezes entrega o pedido
  // para a antiga (ainda saindo) e fecha sozinha: confere e tenta de novo uma vez.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const pid = await spawnRiotClient(exe, args);
    proxiedLaunch = clientConfigUrl ? { pids: pid ? [pid] : [], url: clientConfigUrl } : null;
    if (await waitFor(() => anyRunning(['RiotClientServices.exe']), SPAWN_CONFIRM_MS)) {
      if (clientConfigUrl) void watchLaunchedPids(clientConfigUrl);
      return 'started';
    }
  }
  throw new Error('O Riot Client não abriu. Tente de novo em alguns segundos.');
}

function spawnRiotClient(exe: string, args: string[]): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exe), windowsHide: false });
    child.once('error', () => reject(new Error('Não foi possível iniciar o Riot Client.')));
    child.once('spawn', () => {
      child.unref();
      resolve(child.pid);
    });
  });
}

/** Anota os PIDs do Riot Client que aparecem logo depois de abrir pelo proxy. */
async function watchLaunchedPids(url: string): Promise<void> {
  const deadline = Date.now() + SPAWN_WATCH_MS;
  while (Date.now() < deadline && proxiedLaunch?.url === url) {
    const processes = await readRiotProcesses().catch(() => []);
    for (const { ProcessId } of processes) {
      if (proxiedLaunch?.url === url && !proxiedLaunch.pids.includes(ProcessId)) proxiedLaunch.pids.push(ProcessId);
    }
    // Vigia em segundo plano: não segura o processo aberto sozinho.
    await new Promise((resolve) => setTimeout(resolve, 1_500).unref?.());
  }
}

/** O chat do Riot Client aberto já passa pelo proxy: trata esse processo como aberto por este app. */
export function trustRiotClient(url: string, pids: number[]): void {
  proxiedLaunch = { pids: [...new Set([...(proxiedLaunch?.url === url ? proxiedLaunch.pids : []), ...pids])], url };
}

/** PIDs do Riot Client aberto agora (falha na consulta: lista vazia). */
export async function riotClientPids(): Promise<number[]> {
  return (await readRiotProcesses().catch(() => [])).map((p) => p.ProcessId);
}

export interface RiotProcess { ProcessId: number; CommandLine: string | null }

/** Como o Riot Client aberto chega ao chat: pelo nosso proxy, direto (ou por outro programa), ou ainda não dá para saber. */
export type RiotChatRoute = 'closed' | 'proxied' | 'direct' | 'unknown';

/**
 * Sem administrador o Windows costuma esconder a linha de comando do Riot Client;
 * a conexão de chat dele resolve: ligada ao proxy local = invisível; ligada à
 * porta 5223 da Riot = sem o modo invisível.
 */
export async function riotChatRoute(clientConfigUrl: string, chatPort: number | null): Promise<RiotChatRoute> {
  const { processes, connections } = await readRiotNetwork();
  return classifyChatRoute(processes, connections, clientConfigUrl, chatPort, proxiedLaunch);
}

/** Decisão separada da leitura do sistema para poder ser testada. */
export function classifyChatRoute(
  processes: RiotProcess[],
  connections: Array<{ RemoteAddress: string; RemotePort: number }>,
  clientConfigUrl: string,
  chatPort: number | null,
  launched: { pids: number[]; url: string } | null,
): RiotChatRoute {
  if (processes.length === 0) return 'closed';
  const known = processes.filter((p) => p.CommandLine);
  if (known.some((p) => !usesConfig(p, clientConfigUrl, false))) return 'direct';
  if (known.length) return 'proxied';
  if (chatPort && connections.some((c) => isLoopback(c.RemoteAddress) && c.RemotePort === chatPort)) return 'proxied';
  if (connections.some((c) => c.RemotePort === RIOT_CHAT_PORT && !isLoopback(c.RemoteAddress))) return 'direct';
  if (launched?.url === clientConfigUrl && processes.some((p) => launched.pids.includes(p.ProcessId))) return 'proxied';
  return 'unknown';
}

const RIOT_CHAT_PORT = 5223;
const isLoopback = (address: string) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

async function readRiotNetwork(): Promise<{
  processes: RiotProcess[];
  connections: Array<{ RemoteAddress: string; RemotePort: number }>;
}> {
  if (process.platform !== 'win32') return { processes: [], connections: [] };
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; " +
    "$p = @(Get-CimInstance Win32_Process -Filter \"Name='RiotClientServices.exe'\" | Select-Object ProcessId,CommandLine); " +
    '$ids = @($p | ForEach-Object { $_.ProcessId }); ' +
    '$c = @(if ($ids.Count) { Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ' +
    'Where-Object { $ids -contains $_.OwningProcess } | Select-Object RemoteAddress,RemotePort }); ' +
    '@{ processes = $p; connections = $c } | ConvertTo-Json -Compress -Depth 3',
  ], { windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
  const value = JSON.parse(stdout) as { processes?: unknown; connections?: unknown };
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? v : v ? [v] : []) as T[];
  return {
    processes: list<RiotProcess>(value.processes).filter((p) => Number.isInteger(p?.ProcessId)),
    connections: list<{ RemoteAddress: string; RemotePort: number }>(value.connections)
      .filter((c) => typeof c?.RemoteAddress === 'string' && Number.isInteger(c?.RemotePort)),
  };
}

/** Processos do cliente do LoL e do Riot Client (o jogo em si fica de fora). */
const CLIENT_PROCESSES = [
  'LeagueClient.exe', 'LeagueClientUx.exe', 'LeagueClientUxRender.exe',
  'RiotClientServices.exe', 'Riot Client.exe', 'RiotClientUx.exe', 'RiotClientUxRender.exe', 'RiotClientCrashHandler.exe',
];

/**
 * Fecha o cliente do LoL e o Riot Client para reabrir pelo proxy. Pede ao cliente
 * para sair (salva o que precisa), espera e só então encerra o que sobrou.
 */
export async function closeLeagueAndRiotClient(lcu: LcuCredentials | null): Promise<void> {
  if (lcu) await lcuRequest(lcu, 'POST', '/process-control/v1/process/quit').catch(() => undefined);
  // O Riot Client também aceita sair pela API dele: fecha limpo e apaga o lockfile.
  const riot = readLockfile();
  if (riot) await lcuRequest(riot, 'POST', '/process-control/v1/process/quit').catch(() => undefined);
  await waitFor(async () => !(await anyRunning(['LeagueClient.exe', 'LeagueClientUx.exe', 'RiotClientServices.exe'])), 8_000);

  // O que sobrou é encerrado à força, em até 3 rodadas (processos que se reabrem).
  for (let round = 0; round < 3; round++) {
    if (!(await anyRunning(CLIENT_PROCESSES).catch(() => true))) break;
    const args = ['/F', '/T', ...CLIENT_PROCESSES.flatMap((name) => ['/IM', name])];
    await execFileAsync('taskkill.exe', args, { windowsHide: true, timeout: 15_000 }).catch(() => undefined);
    if (await waitFor(async () => !(await anyRunning(CLIENT_PROCESSES)), 6_000)) break;
  }
  if (await anyRunning(CLIENT_PROCESSES).catch(() => false)) {
    throw new Error('Não consegui fechar o Riot Client. Feche pelo ícone perto do relógio e abra o LoL pelo Rift Companion.');
  }
  proxiedLaunch = null;
  // Dá tempo de o Windows liberar a trava de instância única do Riot Client.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

async function anyRunning(names: string[]): Promise<boolean> {
  const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  const running = new Set(stdout.split(/\r?\n/).map((line) => line.split('","')[0].replace(/^"/, '').toLowerCase()));
  return names.some((name) => running.has(name.toLowerCase()));
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return check().catch(() => false);
}

/** Riot Client aberto agora (falha na consulta conta como fechado). */
export async function isRiotClientRunning(): Promise<boolean> {
  try {
    return (await readRiotProcesses()).length > 0;
  } catch {
    return false;
  }
}

async function readRiotProcesses(): Promise<RiotProcess[]> {
  if (process.platform !== 'win32') throw new Error('Modo invisível disponível somente no Windows.');
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='RiotClientServices.exe'\" | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress",
    ], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    if (!stdout.trim()) return [];
    const value: unknown = JSON.parse(stdout);
    const entries = Array.isArray(value) ? value : [value];
    if (entries.some((entry) => !entry || !Number.isInteger(entry.ProcessId) ||
      (entry.CommandLine !== null && typeof entry.CommandLine !== 'string'))) throw new Error();
    return entries;
  } catch {
    throw new Error('Não foi possível verificar o Riot Client aberto. Tente novamente antes de iniciar invisível.');
  }
}

function usesConfig({ ProcessId, CommandLine }: RiotProcess, expected: string, proxyInUse: boolean): boolean {
  // Sem privilégio de administrador, o Windows devolve CommandLine nulo para o
  // RiotClientServices; vale o PID iniciado aqui ou o chat já passando pelo proxy.
  if (!CommandLine) return proxyInUse || (proxiedLaunch?.url === expected && proxiedLaunch.pids.includes(ProcessId));
  const value = /(?:^|\s)--client-config-url=(?:"([^"]+)"|(\S+))/.exec(CommandLine);
  return (value?.[1] ?? value?.[2]) === expected;
}

/** Lockfile do Riot Client: "Riot Client:pid:porta:senha:https". */
function readLockfile() {
  try {
    const [, pid, port, password, protocol] = readFileSync(LOCKFILE, 'utf8').trim().split(':');
    if (!password || protocol !== 'https' || !Number.isInteger(Number(pid)) || Number(pid) <= 0 ||
      !Number.isInteger(Number(port)) || Number(port) <= 0 || Number(port) > 65535) return null;
    return { port: Number(port), password, pid: Number(pid), installDirectory: null };
  } catch {
    return null;
  }
}

function riotClientPath(): string | null {
  try {
    const installs = JSON.parse(readFileSync(INSTALLS, 'utf8')) as Record<string, unknown>;
    for (const key of ['rc_default', 'rc_live', 'rc_beta']) {
      const candidate = installs[key];
      if (typeof candidate === 'string' && existsSync(candidate)) return candidate;
    }
  } catch {
    // Sem o arquivo de instalações: tenta o caminho padrão.
  }
  return existsSync(RIOT_CLIENT_FALLBACK) ? RIOT_CLIENT_FALLBACK : null;
}
