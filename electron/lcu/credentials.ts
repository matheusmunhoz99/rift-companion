import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LcuCredentials {
  port: number;
  password: string;
  pid: number;
  installDirectory: string | null;
}

const DEFAULT_INSTALL_DIRECTORIES = [
  'C:\\Riot Games\\League of Legends',
  'D:\\Riot Games\\League of Legends',
];

/** Procurar o processo do cliente abre um PowerShell; com o LoL fechado, no máximo a cada 10 s. */
const COMMAND_LINE_INTERVAL_MS = 10_000;
let lastCommandLineLookup = 0;

/**
 * Localiza as credenciais da API local do cliente (LCU).
 * 1) "lockfile" na pasta padrão de instalação, se o processo dono dele ainda existe (só lê um arquivo).
 * 2) Linha de comando do LeagueClientUx.exe (--app-port / --remoting-auth-token), que acha outras pastas.
 * 3) "lockfile" da pasta informada nessa linha de comando.
 */
export async function findLcuCredentials(): Promise<LcuCredentials | null> {
  for (const directory of DEFAULT_INSTALL_DIRECTORIES) {
    const fromLockfile = await readLockfile(directory);
    if (fromLockfile && isAlive(fromLockfile.pid)) return fromLockfile;
  }

  if (Date.now() - lastCommandLineLookup < COMMAND_LINE_INTERVAL_MS) return null;
  lastCommandLineLookup = Date.now();
  const commandLine = await readClientCommandLine();
  if (commandLine) {
    const fromArgs = parseCommandLine(commandLine);
    if (fromArgs) return fromArgs;

    const installDirectory = matchArg(commandLine, 'install-directory');
    if (installDirectory) {
      const fromLockfile = await readLockfile(installDirectory);
      if (fromLockfile) return fromLockfile;
    }
  }
  return null;
}

/** Lockfile esquecido por um cliente que fechou sem apagá-lo aponta para um processo que não existe mais. */
function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: o processo existe, só não é nosso.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readClientCommandLine(): Promise<string | null> {
  if (process.platform !== 'win32') return null;

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -First 1).CommandLine",
      ],
      { windowsHide: true, timeout: 10_000 },
    );
    const commandLine = stdout.trim();
    return commandLine.length > 0 ? commandLine : null;
  } catch {
    return null;
  }
}

function matchArg(commandLine: string, name: string): string | null {
  const match = commandLine.match(new RegExp(`--${name}=(.*?)(?="|\\s--|$)`));
  return match ? match[1].trim() : null;
}

function parseCommandLine(commandLine: string): LcuCredentials | null {
  const port = matchArg(commandLine, 'app-port');
  const password = matchArg(commandLine, 'remoting-auth-token');
  if (!port || !password) return null;

  return {
    port: Number(port),
    password,
    pid: Number(matchArg(commandLine, 'app-pid') ?? 0),
    installDirectory: matchArg(commandLine, 'install-directory'),
  };
}

async function readLockfile(installDirectory: string): Promise<LcuCredentials | null> {
  try {
    const contents = await readFile(path.join(installDirectory, 'lockfile'), 'utf8');
    const [, pid, port, password] = contents.trim().split(':');
    if (!port || !password) return null;
    return { port: Number(port), password, pid: Number(pid), installDirectory };
  } catch {
    return null;
  }
}
