import { app } from 'electron';
import { homedir, release } from 'node:os';
import path from 'node:path';
import { RIFT_API_URL } from './riot/ipc';
import type { Settings } from './settings';

/** Não manda o mesmo erro duas vezes na mesma sessão, nem mais que isto por sessão. */
const MAX_PER_SESSION = 20;
/** Corta a mensagem e o stack para não enviar textos enormes. */
const MAX_MESSAGE = 500;
const MAX_STACK = 4_000;

/**
 * Relatório de erro anônimo: quando algo quebra, manda ao servidor só a mensagem,
 * o stack (com os caminhos pessoais apagados), a versão e o sistema. Nunca nick,
 * Riot ID, token ou qualquer dado da conta. A pessoa pode desligar nas Configurações.
 */
export class ErrorReporter {
  private readonly seen = new Set<string>();
  private readonly home = homedir();
  private readonly userData = app.getPath('userData');

  constructor(private readonly settings: Settings) {}

  /** Liga os apanhadores globais do processo principal. */
  install(): void {
    process.on('uncaughtException', (error) => {
      console.error('[uncaught]', error);
      void this.report('main', error);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('[unhandled]', reason);
      void this.report('main', reason);
    });
  }

  /** Chamado pelo renderer (via IPC) e pelo processo principal. */
  async report(context: string, error: unknown): Promise<void> {
    if (!this.settings.getPreferences().sendErrorReports) return;
    if (this.seen.size >= MAX_PER_SESSION) return;

    const message = scrub(this.clean(describe(error))).slice(0, MAX_MESSAGE);
    if (!message) return;
    const stack = error instanceof Error && error.stack ? scrub(this.clean(error.stack)).slice(0, MAX_STACK) : null;

    // Um erro só uma vez por sessão (a chave ignora números que mudam a cada vez).
    const key = `${context}:${message}`.replace(/\d+/g, '#');
    if (this.seen.has(key)) return;
    this.seen.add(key);

    try {
      await fetch(RIFT_API_URL + '/v1/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: context.slice(0, 40),
          message,
          stack,
          version: app.getVersion(),
          platform: `${process.platform} ${release()}`,
          arch: process.arch,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Sem internet ou servidor fora: o relatório não é essencial, apenas se perde.
    }
  }

  /** Troca os caminhos pessoais (pasta do usuário, instalação) por marcadores fixos. */
  private clean(text: string): string {
    let out = text;
    for (const base of [this.userData, this.home, app.getAppPath(), process.env.PORTABLE_EXECUTABLE_DIR]) {
      if (base) out = replaceAll(out, base, markerFor(base));
    }
    // Qualquer "C:\Users\<nome>" que tenha escapado (caminhos de outra origem).
    return out.replace(/([A-Za-z]:\\Users\\)[^\\/]+/gi, '$1<user>').replace(/(\/Users\/)[^/]+/g, '$1<user>');
  }
}

function markerFor(base: string): string {
  const name = path.basename(base).toLowerCase();
  if (name.includes('portable') || base === process.env.PORTABLE_EXECUTABLE_DIR) return '<app>';
  return name === 'rift-companion' ? '<appdata>' : '<home>';
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Apaga o que puder parecer dado pessoal, por garantia dupla. */
export function scrub(text: string): string {
  return text
    // Riot ID "Nick#TAG" -> <riot-id>
    .replace(/[^\s"'<>]{3,32}#[A-Za-z0-9]{2,8}\b/g, '<riot-id>')
    // PUUID (longo, base64url) -> <puuid>
    .replace(/\b[A-Za-z0-9_-]{60,}\b/g, '<id>')
    // E-mails, por via das dúvidas
    .replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, '<email>');
}

function replaceAll(text: string, search: string, replace: string): string {
  return text.split(search).join(replace);
}
