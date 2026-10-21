import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1024 * 1024;
let file: string | null = null;

/**
 * Registro do app em %APPDATA%\Rift Companion\logs\app.log, para entender uma queda
 * depois que ela aconteceu. Só eventos (fases, conexões, erros): nunca senhas, tokens
 * ou mensagens do chat. Passando de 1 MB, vira app.anterior.log.
 */
export function startAppLog(userData: string): void {
  const directory = path.join(userData, 'logs');
  try {
    mkdirSync(directory, { recursive: true });
    file = path.join(directory, 'app.log');
  } catch {
    file = null;
  }
}

export function appLog(line: string): void {
  if (!file) return;
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
      renameSync(file, file.replace(/\.log$/, '.anterior.log'));
    }
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Sem disco ou sem permissão: o app segue sem registro.
  }
}
