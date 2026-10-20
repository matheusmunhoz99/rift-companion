import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { LcuHttpError, lcuRequest } from './http';

const LOCKFILE = path.join(process.env.LOCALAPPDATA ?? '', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
const INSTALLS = 'C:/ProgramData/Riot Games/RiotClientInstalls.json';
const RIOT_CLIENT_FALLBACK = 'C:/Riot Games/Riot Client/RiotClientServices.exe';
const LAUNCH_ARGS = ['--launch-product=league_of_legends', '--launch-patchline=live'];
const execFileAsync = promisify(execFile);
let launching: Promise<LeagueLaunchResult> | null = null;
/** Riot Client iniciado por este app com o proxy (o Windows nem sempre expõe a linha de comando). */
let proxiedLaunch: { pid: number; url: string } | null = null;

export type LeagueLaunchResult = 'riot-client' | 'already-open' | 'started' | 'restart-required' | null;

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
  await new Promise<void>((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exe), windowsHide: false });
    child.once('error', () => reject(new Error('Não foi possível iniciar o Riot Client.')));
    child.once('spawn', () => {
      proxiedLaunch = clientConfigUrl && child.pid ? { pid: child.pid, url: clientConfigUrl } : null;
      child.unref();
      resolve();
    });
  });
  return 'started';
}

interface RiotProcess { ProcessId: number; CommandLine: string | null }

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
  if (!CommandLine) return proxyInUse || (proxiedLaunch?.pid === ProcessId && proxiedLaunch.url === expected);
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
