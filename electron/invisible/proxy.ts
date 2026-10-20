import { createSecureContext, createServer as createTlsServer, connect as connectTls, type TLSSocket } from 'node:tls';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Server as TlsServer } from 'node:tls';
import { Transform } from 'node:stream';
import { EventEmitter } from 'node:events';
import pki from '@blamejs/pki';
import {
  buddyMessage, buddyPresence, effectiveStatus, HELP_TEXT, parseCommand, statusLine, type InvisibleState,
} from './buddy';
import { affinityFromJwt, parseClientConfig, patchClientConfig, usesChatAffinity, type ChatTarget } from './config';
import { PresenceStreamFilter } from './presence';
import { ServerStreamRelay } from './roster';

const CLIENT_CONFIG_URL = 'https://clientconfig.rpg.riotgames.com';
const CHAT_PAS_URL = 'https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat';
// Mesmo endpoint público usado pelo Deceive. O domínio resolve para
// 127.0.0.1 e o PFX corresponde somente a esse host local.
const DEFAULT_LOCAL_HOST = 'deceive-localhost.molenzwiebel.xyz';
const DEFAULT_CERT_URL = 'https://mln.cx/deceive/localhost.pfx';
const MAX_CONFIG_BYTES = 8 * 1024 * 1024;
const MAX_CERT_BYTES = 1024 * 1024;
const CERT_REFRESH_MARGIN_MS = 20 * 24 * 60 * 60 * 1000;

interface ProxiedChatConnection {
  client: TLSSocket;
  riot: TLSSocket;
  filter: PresenceStreamFilter;
  relay: ServerStreamRelay;
  /** Lado legível do fluxo servidor → cliente: injeta stanzas locais na ordem certa. */
  toClient: Transform;
  close: () => void;
}

/**
 * Eventos: `connected` (Riot Client entrou no chat pelo proxy), `buddy-ready`
 * (contato na lista, pode receber mensagens) e `command` (pedido de mudança
 * feito pelo chat; quem guarda as preferências decide e chama `configure`).
 */
export interface InvisibleModeEvents {
  connected: [];
  'buddy-ready': [];
  command: [changes: Partial<InvisibleState>];
}

interface TlsMaterial {
  cert: Buffer;
  key: Buffer;
}

/**
 * Proxy local do chat da Riot. O Riot Client recebe um clientconfig modificado,
 * conecta por TLS ao host local e este processo abre uma segunda conexão TLS
 * com o servidor real. Apenas presenças globais são alteradas, e o contato
 * local "Rift Companion" mostra e troca o status pelo próprio chat do LoL.
 */
export class InvisibleModeProxy extends EventEmitter<InvisibleModeEvents> {
  private readonly localHost = process.env.RIFT_OFFLINE_HOST ?? DEFAULT_LOCAL_HOST;
  private readonly certificateUrl = process.env.RIFT_OFFLINE_CERT_URL ?? DEFAULT_CERT_URL;
  private readonly certificateFile: string;
  private readonly logFile: string;
  /** Portas e servidor de chat da sessão, para reabrir o proxy no mesmo lugar. */
  private readonly sessionFile: string;
  private ports: { chatPort: number; configPort: number } | null = null;
  private configServer: HttpServer | null = null;
  private chatServer: TlsServer | null = null;
  private target: ChatTarget | null = null;
  private starting: Promise<string> | null = null;
  private state: InvisibleState = { enabled: true, status: 'offline', lobbyChat: true };
  private readonly lifetime = new AbortController();
  private readonly connections = new Set<ProxiedChatConnection>();

  constructor(dataDirectory: string) {
    super();
    this.certificateFile = path.join(dataDirectory, 'offline-chat.pfx');
    this.logFile = path.join(dataDirectory, 'debug.log');
    this.sessionFile = path.join(dataDirectory, 'session.json');
  }

  /** Já houve uma sessão pelo proxy (há portas e servidor para retomar). */
  hasSavedSession(): boolean {
    return existsSync(this.sessionFile);
  }

  private async readSession(): Promise<{ chatPort?: number; configPort?: number; target?: ChatTarget } | null> {
    try {
      const value = JSON.parse(await readFile(this.sessionFile, 'utf8')) as Record<string, unknown>;
      const port = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 && (n as number) <= 65535 ? (n as number) : undefined);
      const target = value.target as Partial<ChatTarget> | undefined;
      return {
        chatPort: port(value.chatPort),
        configPort: port(value.configPort),
        target: typeof target?.host === 'string' && target.host && port(target.port)
          ? { host: target.host, port: target.port! }
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private async writeSession(): Promise<void> {
    if (!this.ports) return;
    await writeFile(this.sessionFile, JSON.stringify({ ...this.ports, target: this.target })).catch(() => undefined);
  }

  /** Há um Riot Client conectado ao chat por este proxy. */
  hasActiveChat(): boolean {
    return this.connections.size > 0;
  }

  /** URL passada em --client-config-url ao iniciar o Riot Client. */
  start(): Promise<string> {
    if (this.lifetime.signal.aborted) return Promise.reject(new Error('Modo invisível encerrado.'));
    this.starting ??= this.startInternal().catch((error) => {
      this.starting = null;
      throw error;
    });
    return this.starting;
  }

  getState(): InvisibleState {
    return { ...this.state };
  }

  /**
   * Aplica o estado às conexões abertas: reenvia a última presença global com o
   * novo status, atualiza o recado do contato e avisa a troca no chat.
   */
  configure(next: InvisibleState): void {
    const previous = this.state;
    this.state = { ...next };
    const statusChanged = effectiveStatus(previous) !== effectiveStatus(next);
    const enabledChanged = previous.enabled !== next.enabled;
    if (!statusChanged && !enabledChanged && previous.status === next.status && previous.lobbyChat === next.lobbyChat) return;
    this.log(`estado: ativado=${next.enabled} status=${next.status} chatDeSala=${next.lobbyChat} ` +
      `(${this.connections.size} conexão(ões) de chat)`);
    for (const connection of this.connections) {
      if (statusChanged) {
        const presence = connection.filter.replay();
        if (presence && !connection.riot.destroyed) connection.riot.write(presence);
      }
      this.sendToClient(connection, buddyPresence(next));
    }
    if (enabledChanged || statusChanged) this.sendBuddyMessages([statusLine(next)]);
    else if (previous.lobbyChat !== next.lobbyChat) {
      this.sendBuddyMessages([next.lobbyChat
        ? 'Chat de sala ligado: você entra no chat do grupo e da seleção normalmente.'
        : 'Chat de sala desligado: você também some das salas (o chat do grupo e da seleção não funciona).']);
    }
  }

  /** Mensagens do contato Rift Companion em todas as conexões com o contato pronto. */
  sendBuddyMessages(lines: string[]): void {
    for (const connection of this.connections) {
      for (const line of lines) this.sendToClient(connection, buddyMessage(line));
    }
  }

  private sendToClient(connection: ProxiedChatConnection, xml: string): void {
    if (!connection.relay.ready || connection.toClient.destroyed) return;
    connection.toClient.push(Buffer.from(xml));
  }

  private handleBuddyMessage(text: string): void {
    const command = parseCommand(text);
    const state = this.state;
    switch (command.kind) {
      case 'status':
        this.sendBuddyMessages([statusLine(state) + (state.lobbyChat ? '' : ' Chat de sala desligado.')]);
        return;
      case 'help':
        this.sendBuddyMessages([HELP_TEXT]);
        return;
      case 'toggle-lobby':
        this.emit('command', { lobbyChat: !state.lobbyChat });
        return;
      case 'change': {
        const next = { ...state, ...command.changes };
        if (next.enabled === state.enabled && next.status === state.status) {
          this.sendBuddyMessages([`Nada mudou. ${statusLine(state)}`]);
          return;
        }
        this.emit('command', command.changes);
      }
    }
  }

  dispose(): void {
    this.lifetime.abort();
    for (const connection of this.connections) connection.close();
    this.connections.clear();
    this.configServer?.close();
    this.chatServer?.close();
    this.configServer = null;
    this.chatServer = null;
    this.starting = null;
    this.target = null;
  }

  private async startInternal(): Promise<string> {
    await mkdir(path.dirname(this.logFile), { recursive: true }).catch(() => undefined);
    await writeFile(this.logFile, '').catch(() => undefined);
    this.log(`iniciando proxy (ativado=${this.state.enabled}, status=${this.state.status})`);
    try {
      await this.assertLocalResolution();
      const certificate = await this.loadCertificate();
      this.lifetime.signal.throwIfAborted();
      this.validateCertificate(certificate);

      // Mesmas portas e mesmo servidor da sessão anterior: um Riot Client que
      // continuou aberto depois que o app fechou volta a achar o chat sozinho.
      const saved = await this.readSession();
      this.target ??= saved?.target ?? null;

      this.chatServer = createTlsServer({ ...certificate, handshakeTimeout: 15_000 }, (client) => this.acceptChat(client));
      this.chatServer.on('tlsClientError', (error) => console.warn('[invisible] TLS local recusado:', error.message));
      const chatPort = await listenPreferred(this.chatServer, this.lifetime.signal, saved?.chatPort);

      this.configServer = createHttpServer((req, res) => void this.proxyConfig(req, res, chatPort));
      const configPort = await listenPreferred(this.configServer, this.lifetime.signal, saved?.configPort);
      this.chatServer.on('error', () => console.warn('[invisible] Erro no servidor local de chat.'));
      this.configServer.on('error', () => console.warn('[invisible] Erro no servidor local de configuração.'));
      this.ports = { chatPort, configPort };
      void this.writeSession();
      const reused = saved?.chatPort === chatPort && saved?.configPort === configPort;
      this.log(`proxy pronto: config 127.0.0.1:${configPort}, chat 127.0.0.1:${chatPort}` +
        (reused ? ' (mesmas portas da sessão anterior)' : '') +
        (this.target ? `; servidor lembrado ${this.target.host}:${this.target.port}` : ''));
      return `http://127.0.0.1:${configPort}`;
    } catch (error) {
      this.log(`falha ao iniciar: ${messageOf(error)}`);
      this.configServer?.close();
      this.chatServer?.close();
      this.configServer = null;
      this.chatServer = null;
      throw error;
    }
  }

  private log(line: string): void {
    void appendFile(this.logFile, `${new Date().toISOString()} ${line}\n`).catch(() => undefined);
  }

  private validateCertificate(material: TlsMaterial): X509Certificate {
    createSecureContext(material);
    const leaf = new X509Certificate(material.cert);
    if (!leaf.checkHost(this.localHost)) throw new Error(`Certificado não pertence a ${this.localHost}.`);
    if (Date.parse(leaf.validFrom) > Date.now() || Date.parse(leaf.validTo) <= Date.now()) {
      throw new Error('Certificado local fora do período de validade.');
    }
    return leaf;
  }

  private async assertLocalResolution(): Promise<void> {
    let addresses: Awaited<ReturnType<typeof dns.lookup>>[] | { address: string }[];
    try {
      addresses = await dns.lookup(this.localHost, { all: true });
    } catch {
      throw new Error(
        `O domínio local do modo invisível (${this.localHost}) ainda não está configurado no DNS.`,
      );
    }
    if (addresses.length === 0 || addresses.some(({ address }) => address !== '127.0.0.1')) {
      throw new Error(`O domínio ${this.localHost} precisa resolver somente para 127.0.0.1.`);
    }
  }

  private async loadCertificate(): Promise<TlsMaterial> {
    let cached: TlsMaterial | null = null;
    if (existsSync(this.certificateFile)) {
      try {
        cached = await convertPfx(this.certificateFile);
        const certificate = this.validateCertificate(cached);
        if (Date.parse(certificate.validTo) - Date.now() > CERT_REFRESH_MARGIN_MS) return cached;
      } catch {
        cached = null;
      }
    }
    let downloadError: unknown = null;
    try {
      const response = await fetch(this.certificateUrl, {
        headers: { 'User-Agent': 'Rift-Companion' },
        cache: 'no-store',
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await readResponseBytes(response, MAX_CERT_BYTES);
      if (bytes.length === 0) throw new Error('arquivo inválido');
      this.lifetime.signal.throwIfAborted();
      await mkdir(path.dirname(this.certificateFile), { recursive: true });
      const temporary = this.certificateFile + '.download';
      await writeFile(temporary, bytes);
      const material = await convertPfx(temporary);
      this.validateCertificate(material);
      await rename(temporary, this.certificateFile);
      return material;
    } catch (error) {
      downloadError = error;
      await unlink(this.certificateFile + '.download').catch(() => undefined);
    }

    this.lifetime.signal.throwIfAborted();
    if (cached) {
      this.validateCertificate(cached);
      console.warn('[invisible] Certificado não atualizou; usando cache válido.');
      return cached;
    }
    throw new Error(`Não foi possível preparar o certificado do modo invisível: ${messageOf(downloadError)}`);
  }

  private async proxyConfig(req: IncomingMessage, res: ServerResponse, chatPort: number): Promise<void> {
    const request = new AbortController();
    const onClose = () => request.abort();
    res.once('close', onClose);
    const signal = AbortSignal.any([request.signal, this.lifetime.signal, AbortSignal.timeout(30_000)]);
    try {
      if (req.method !== 'GET' || !req.url?.startsWith('/') || req.url.startsWith('//')) {
        respond(res, 405, 'text/plain', 'Método não permitido.');
        return;
      }
      const headers: Record<string, string> = {};
      copyHeader(req, headers, 'user-agent');
      copyHeader(req, headers, 'authorization');
      copyHeader(req, headers, 'x-riot-entitlements-jwt');

      const upstream = await fetch(CLIENT_CONFIG_URL + req.url, {
        headers,
        signal,
      });
      const bytes = await readResponseBytes(upstream, MAX_CONFIG_BYTES);
      let body = bytes.toString('utf8');

      if (upstream.ok) {
        const config = parseClientConfig(body);
        const affinity = usesChatAffinity(config) ? await this.fetchAffinity(headers.authorization, signal) : null;
        const patched = patchClientConfig(config, this.localHost, chatPort, affinity);
        signal.throwIfAborted();
        body = patched.body;
        if (patched.target && (patched.target.host !== this.target?.host || patched.target.port !== this.target?.port)) {
          this.target = patched.target;
          void this.writeSession();
        }
        const keys = ['chat.host', 'chat.port', 'chat.affinities'].filter((key) => Object.hasOwn(config, key));
        this.log(`clientconfig ${req.url.split('?')[0]} -> ${upstream.status}; chaves de chat: ${keys.join(',') || 'nenhuma'}` +
          (keys.length ? `; afinidade=${affinity ?? '-'}; destino=${patched.target ? `${patched.target.host}:${patched.target.port}` : 'inalterado'}` : ''));
      } else {
        this.log(`clientconfig ${req.url.split('?')[0]} -> ${upstream.status} (repassado sem alteração)`);
      }
      respond(res, upstream.status, upstream.headers.get('content-type') ?? 'application/json', body);
    } catch (error) {
      console.warn('[invisible] Falha no clientconfig:', messageOf(error));
      this.log(`falha no clientconfig ${req.url?.split('?')[0]}: ${messageOf(error)}`);
      respond(res, 502, 'application/json', JSON.stringify({ error: 'Falha ao carregar configuração da Riot.' }));
    } finally {
      res.off('close', onClose);
    }
  }

  private async fetchAffinity(authorization: string | undefined, signal: AbortSignal): Promise<string | null> {
    if (!authorization) return null;
    try {
      const response = await fetch(CHAT_PAS_URL, {
        headers: { Authorization: authorization },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      const bytes = await readResponseBytes(response, 64 * 1024);
      return response.ok ? affinityFromJwt(bytes.toString('utf8')) : null;
    } catch {
      return null;
    }
  }

  private acceptChat(client: TLSSocket): void {
    const target = this.target;
    if (!target || this.lifetime.signal.aborted) {
      this.log('conexão de chat recusada: ainda sem servidor da Riot no clientconfig');
      client.destroy();
      return;
    }
    this.log(`Riot Client conectou ao chat local; encaminhando para ${target.host}:${target.port}`);

    client.pause();
    const riot = connectTls({
      host: target.host,
      port: target.port,
      servername: target.host,
      rejectUnauthorized: true,
    });
    const filter = new PresenceStreamFilter(() => effectiveStatus(this.state), {
      lobbyChat: () => this.state.lobbyChat,
      // Fora do transform: a resposta pode reenviar a presença à Riot.
      onBuddyMessage: (text) => setImmediate(() => this.handleBuddyMessage(text)),
      log: (line) => this.log(line),
    });
    const relay = new ServerStreamRelay(() => {
      this.sendToClient(connection, buddyPresence(this.state));
      this.emit('buddy-ready');
    }, (line) => this.log(line));
    const toClient = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        for (const part of relay.push(chunk)) this.push(part);
        done();
      },
    });
    const transform = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        try {
          for (const part of filter.push(chunk)) this.push(part);
          done();
        } catch {
          done(new Error('Fluxo de chat inválido; conexão fechada para preservar o modo invisível.'));
        }
      },
      flush(done) {
        try {
          filter.flush();
          done();
        } catch {
          done(new Error('Fluxo de chat encerrado com uma stanza incompleta.'));
        }
      },
    });
    let closed = false;
    const deadline = setTimeout(() => close(new Error('Tempo esgotado ao conectar ao chat.')), 15_000);
    deadline.unref();
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      if (error) console.warn('[invisible] Conexão de chat encerrada:', error.message);
      this.log(`conexão de chat encerrada${error ? `: ${error.message}` : ''}`);
      clearTimeout(deadline);
      client.unpipe(transform);
      transform.unpipe(riot);
      riot.unpipe(toClient);
      toClient.unpipe(client);
      transform.destroy();
      toClient.destroy();
      client.destroy();
      riot.destroy();
      this.connections.delete(connection);
    };
    const connection: ProxiedChatConnection = { client, riot, filter, relay, toClient, close };
    this.connections.add(connection);
    transform.on('error', close);
    toClient.on('error', close);
    client.on('error', close);
    riot.on('error', close);
    client.on('close', () => close());
    riot.on('close', () => close());
    riot.once('secureConnect', () => {
      if (closed) return;
      clearTimeout(deadline);
      this.log('TLS com o servidor da Riot estabelecido');
      // pipe aplica backpressure nas duas direções; só libera o cliente após TLS.
      client.pipe(transform).pipe(riot);
      riot.pipe(toClient).pipe(client);
      this.emit('connected');
    });
  }
}

function copyHeader(req: IncomingMessage, target: Record<string, string>, name: string): void {
  const value = req.headers[name];
  if (typeof value === 'string') target[name] = value;
}

function respond(res: ServerResponse, status: number, contentType: string, body: string): void {
  if (res.destroyed || res.writableEnded) return;
  const bytes = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(bytes);
}

/** Tenta a porta da sessão anterior; ocupada (ou ausente), usa qualquer porta livre. */
async function listenPreferred(server: HttpServer | TlsServer, signal: AbortSignal, preferred: number | undefined): Promise<number> {
  if (preferred) {
    try {
      return await listen(server, signal, preferred);
    } catch (error) {
      signal.throwIfAborted();
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
  }
  return listen(server, signal, 0);
}

function listen(server: HttpServer | TlsServer, signal: AbortSignal, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      server.close();
      reject(new Error('Inicialização do modo invisível cancelada.'));
    };
    const onError = (error: Error) => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    server.once('error', onError);
    server.listen({ port, host: '127.0.0.1', signal }, () => {
      server.off('error', onError);
      signal.removeEventListener('abort', onAbort);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Impõe o limite durante a leitura, inclusive para respostas sem Content-Length. */
export async function readResponseBytes(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Resposta grande demais.');
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error('Resposta grande demais.');
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * O PFX atual do Deceive usa uma chave ECDSA que o OpenSSL embarcado no
 * Electron não importa diretamente. Extraímos os objetos PKCS#8/X.509 do
 * contêiner e entregamos chave e cadeia em PEM ao servidor TLS do Node.
 */
async function convertPfx(pfxFile: string): Promise<TlsMaterial> {
  const pfx = await readFile(pfxFile);
  const store = await pki.pkcs12.open(pfx, '', { keys: 'der' });
  const privateDer = store.keys[0]?.pkcs8;
  if (!privateDer) throw new Error('PFX sem chave privada PKCS#8.');
  const key = createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' }).export({
    format: 'pem',
    type: 'pkcs8',
  });

  if (store.certs.length === 0) throw new Error('PFX sem cadeia de certificados.');
  // O PFX publica a cadeia na ordem folha -> raiz.
  const cert = store.certs
    .map(({ cert: raw }) => new X509Certificate(raw).toString())
    .join('');
  return { cert: Buffer.from(cert), key: Buffer.isBuffer(key) ? key : Buffer.from(key) };
}
