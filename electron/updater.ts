import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { compareVersions } from './version';

const DOWNLOADS_URL =
  (process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br') + '/downloads/';
const CHECK_INTERVAL_MS = 6 * 60 * 60_000;

export interface ReleaseInfo {
  version: string;
  file: string;
  sha256: string;
  size: number;
  notes: string[];
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'available'; release: ReleaseInfo }
  | { state: 'downloading'; release: ReleaseInfo; progress: number }
  | { state: 'error'; message: string };

/**
 * Atualização do .exe portátil: confere o manifesto publicado no servidor,
 * baixa a versão nova ao lado da atual, confere o SHA-256 e abre a nova
 * (que substitui esta, pela troca de versão da instância única).
 */
export class Updater {
  private status: UpdateStatus = { state: 'idle' };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  start(): void {
    if (!app.isPackaged) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<UpdateStatus> {
    if (this.status.state === 'downloading') return this.status;
    try {
      const response = await fetch(DOWNLOADS_URL + 'latest.json', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return this.status;
      const release = parseRelease(await response.json());
      if (release && compareVersions(release.version, app.getVersion()) > 0) {
        this.setStatus({ state: 'available', release });
      }
    } catch {
      // Sem internet ou servidor fora: tenta de novo na próxima verificação.
    }
    return this.status;
  }

  async install(): Promise<void> {
    if (this.status.state !== 'available') throw new Error('Nenhuma atualização disponível.');
    const release = this.status.release;
    this.setStatus({ state: 'downloading', release, progress: 0 });

    // No .exe portátil a pasta estável é a do arquivo original, não a pasta temporária.
    const directory = process.env.PORTABLE_EXECUTABLE_DIR ?? path.join(app.getPath('userData'), 'updates');
    const target = path.join(directory, release.file);
    const partial = `${target}.download`;

    try {
      await mkdir(directory, { recursive: true });
      await this.download(release, partial);
      await rm(target, { force: true });
      await rename(partial, target);
    } catch (error) {
      await rm(partial, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ state: 'error', message: `Falha ao baixar a atualização: ${message}` });
      throw error;
    }

    // Abre a versão nova; ao iniciar, ela pede o lugar desta, que fecha.
    spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 1500);
  }

  private async download(release: ReleaseInfo, file: string): Promise<void> {
    const response = await fetch(DOWNLOADS_URL + encodeURIComponent(release.file));
    if (!response.ok || !response.body) throw new Error(`servidor respondeu ${response.status}`);

    const hash = createHash('sha256');
    const output = createWriteStream(file);
    let received = 0;
    let lastReported = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        received += value.length;
        if (!output.write(value)) await new Promise<void>((resolve) => output.once('drain', () => resolve()));
        const progress = Math.min(received / release.size, 1);
        if (progress - lastReported >= 0.02) {
          lastReported = progress;
          this.setStatus({ state: 'downloading', release, progress });
        }
      }
    } finally {
      await new Promise<void>((resolve) => output.end(resolve));
    }

    const size = (await stat(file)).size;
    if (size !== release.size) throw new Error('tamanho do arquivo diferente do esperado');
    if (hash.digest('hex') !== release.sha256.toLowerCase()) throw new Error('arquivo corrompido (SHA-256 não confere)');
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.onStatus(status);
  }
}

/**
 * Só os .exe publicados pelo release, nunca cópias renomeadas: "RiftCompanion-1.0.0.exe"
 * e os do beta ("RiftCompanion-Beta-0.5.0-beta.7.exe").
 */
const RELEASE_FILE = /^RiftCompanion-(?:Beta-)?(\d+\.\d+\.\d+(?:-beta\.\d+)?)\.exe$/;
const CLEANUP_ATTEMPTS = 24;
const CLEANUP_RETRY_MS = 5_000;

/**
 * Depois de atualizar, apaga da pasta do .exe portátil as versões mais antigas.
 * A anterior ainda pode estar fechando (arquivo em uso), por isso tenta por até 2 min.
 * Vale também para a atualização a partir de versões que não tinham esta limpeza.
 */
export async function removeOldVersions(
  directory = process.env.PORTABLE_EXECUTABLE_DIR,
  currentVersion = app.getVersion(),
  retryMs = CLEANUP_RETRY_MS,
): Promise<string[]> {
  if (!directory) return [];
  const removed: string[] = [];
  let pending: string[];
  try {
    pending = (await readdir(directory)).filter((name) => {
      const version = RELEASE_FILE.exec(name)?.[1];
      return !!version && compareVersions(version, currentVersion) < 0;
    });
  } catch {
    return [];
  }
  for (let attempt = 0; attempt < CLEANUP_ATTEMPTS && pending.length; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, retryMs));
    const still: string[] = [];
    for (const name of pending) {
      try {
        await rm(path.join(directory, name));
        removed.push(name);
      } catch (error) {
        // Em uso (a versão antiga ainda fechando): tenta de novo; sumiu: nada a fazer.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') still.push(name);
      }
    }
    pending = still;
  }
  return removed;
}

function parseRelease(raw: unknown): ReleaseInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const valid =
    typeof r['version'] === 'string' &&
    typeof r['file'] === 'string' &&
    /^[\w.-]+\.exe$/.test(r['file']) &&
    typeof r['sha256'] === 'string' &&
    /^[a-f0-9]{64}$/i.test(r['sha256']) &&
    typeof r['size'] === 'number';
  if (!valid) return null;
  return {
    version: r['version'] as string,
    file: r['file'] as string,
    sha256: r['sha256'] as string,
    size: r['size'] as number,
    notes: Array.isArray(r['notes']) ? (r['notes'] as unknown[]).filter((n): n is string => typeof n === 'string') : [],
  };
}
