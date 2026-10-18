import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LcuHttpError, lcuRequest } from './http';

const LOCKFILE = path.join(process.env.LOCALAPPDATA ?? '', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
const INSTALLS = 'C:/ProgramData/Riot Games/RiotClientInstalls.json';
const RIOT_CLIENT_FALLBACK = 'C:/Riot Games/Riot Client/RiotClientServices.exe';
const LAUNCH_ARGS = ['--launch-product=league_of_legends', '--launch-patchline=live'];

/**
 * Abre o League of Legends. Com o Riot Client já aberto (ex.: depois de fechar só o
 * LoL), pede pela API local dele; rodar o .exe de novo não repassa o pedido para a
 * instância aberta. Com o Riot Client fechado, abre o .exe já mandando abrir o LoL.
 * Se a conta não estiver salva, o Riot Client mostra o login no PC.
 */
export async function launchLeague(): Promise<'riot-client' | 'already-open' | 'started' | null> {
  const credentials = readLockfile();
  if (credentials) {
    try {
      await lcuRequest(credentials, 'POST', '/product-launcher/v1/products/league_of_legends/patchlines/live');
      return 'riot-client';
    } catch (error) {
      // 423 already_launched: o LoL já está aberto (ou abrindo).
      if (error instanceof LcuHttpError && error.status === 423) return 'already-open';
      // Outro erro: lockfile antigo (Riot Client fechado sem apagar); tenta pelo .exe.
    }
  }

  const exe = riotClientPath();
  if (!exe) return null;
  spawn(exe, LAUNCH_ARGS, { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref();
  return 'started';
}

/** Lockfile do Riot Client: "Riot Client:pid:porta:senha:https". */
function readLockfile() {
  try {
    const [, pid, port, password] = readFileSync(LOCKFILE, 'utf8').trim().split(':');
    if (!port || !password) return null;
    return { port: Number(port), password, pid: Number(pid), installDirectory: null };
  } catch {
    return null;
  }
}

function riotClientPath(): string | null {
  try {
    const installs = JSON.parse(readFileSync(INSTALLS, 'utf8')) as { rc_default?: string };
    if (installs.rc_default && existsSync(installs.rc_default)) return installs.rc_default;
  } catch {
    // Sem o arquivo de instalações: tenta o caminho padrão.
  }
  return existsSync(RIOT_CLIENT_FALLBACK) ? RIOT_CLIENT_FALLBACK : null;
}
