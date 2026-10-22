import { app, safeStorage } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import type { LcuConnector } from '../lcu/connector';
import { ipcMain, invokeMobile, readMobile } from './rpc';

const BASE = process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br';
interface Device { id: string; name: string; approved: number; created: number }
interface Command { id: string; device: string; channel: string; args: unknown[]; phase: string | null; expires: number }

export class AndroidLink {
  private token: string | null = null;
  private stopped = false;
  private registering: Promise<void> | null = null;
  private started = false;
  private mutating: Promise<unknown> = Promise.resolve();
  private readonly file = path.join(app.getPath('userData'), 'mobile', 'credential.bin');
  private error: string | null = null;

  constructor(private readonly connector: LcuConnector) {
    ipcMain.handle('mobile:pair', async () => {
      await this.ensureRegistered();
      const pair = await this.api<{ code: string; expires: number }>('pc/pair', {});
      const text = `rift-companion://pair?v=1&code=${pair.code}`;
      return { image: await QRCode.toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: 'M' }), text, expires: pair.expires };
    });
    ipcMain.handle('mobile:devices', async () => ({ devices: this.token ? await this.api<Device[]>('pc/devices') : [], error: this.error }));
    ipcMain.handle('mobile:approve', async (_event, id: string) => this.api('pc/approve', { id }));
    ipcMain.handle('mobile:revoke', async (_event, id: string) => this.api('pc/revoke', { id }));
    void this.restore();
  }

  stop(): void { this.stopped = true; }

  private async restore(): Promise<void> {
    try {
      this.token = safeStorage.decryptString(await readFile(this.file));
      this.start();
    } catch { /* First run: no relay or registration until the user opens pairing. */ }
  }

  private ensureRegistered(): Promise<void> {
    this.registering ??= (async () => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não disponibilizou o armazenamento seguro.');
      if (!this.token) {
        const result = await this.api<{ token: string }>('register', {});
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(this.file, safeStorage.encryptString(result.token));
        this.token = result.token;
      }
      this.start();
    })().finally(() => { this.registering = null; });
    return this.registering;
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    void this.publishLoop();
    void this.commandLoop();
  }

  private async publishLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const [prefs, postgame, info] = await Promise.all([readMobile('prefs:get'), readMobile('postgame:get'), readMobile('app:info')]);
        await this.api('pc/state', { data: { lcu: this.connector.getState(), prefs, postgame, info } });
        this.error = null;
      } catch (error) { this.error = error instanceof Error ? error.message : 'PC sem conexão com o servidor.'; }
      await delay(this.error ? 5_000 : 2_000);
    }
  }

  private async commandLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const { commands } = await this.api<{ commands: Command[] }>('pc/commands');
        for (const command of commands) {
          // Reads can run together. Mutations are ordered and never retried automatically.
          if (command.channel.startsWith('stats:') || command.channel.startsWith('riot:get-') ||
              ['riot:find-player', 'builds:get', 'lobby:queues', 'lobby:friends', 'lobby:champions'].includes(command.channel))
            void this.execute(command);
          else this.mutating = this.mutating.then(() => this.execute(command), () => this.execute(command));
        }
      } catch { await delay(5_000); }
    }
  }

  private async execute(command: Command): Promise<void> {
    let result: { value?: unknown; error?: string };
    try {
      if (this.stopped || Date.now() >= command.expires) throw new Error('Comando expirado. Confira a tela antes de repetir.');
      const devices = await this.api<Device[]>('pc/devices');
      if (!devices.some(d => d.id === command.device && d.approved)) throw new Error('Aparelho revogado.');
      if (Date.now() >= command.expires) throw new Error('Comando expirado.');
      result = { value: await invokeMobile(command.channel, command.args, command.phase, this.connector.getState().gameflowPhase) };
    } catch (error) { result = { error: error instanceof Error ? error.message : 'Não foi possível executar a ação.' }; }
    await this.api('pc/result', { id: command.id, ...result }).catch(() => undefined);
  }

  private async api<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${BASE}/v1/mobile/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Servidor indisponível (${response.status}).`);
    return data;
  }
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
