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

/**
 * Localiza as credenciais da API local do cliente (LCU).
 * 1) Linha de comando do LeagueClientUx.exe (--app-port / --remoting-auth-token).
 * 2) Arquivo "lockfile" na pasta de instalação (nome:pid:porta:senha:protocolo).
 */
export async function findLcuCredentials(): Promise<LcuCredentials | null> {
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

  for (const directory of DEFAULT_INSTALL_DIRECTORIES) {
    const fromLockfile = await readLockfile(directory);
    if (fromLockfile) return fromLockfile;
  }

  return null;
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
