import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { LcuCredentials } from './credentials';
import { authHeader } from './http';

export interface LcuEvent {
  uri: string;
  eventType: 'Create' | 'Update' | 'Delete';
  data: unknown;
}

// Opcodes do protocolo WAMP 1.0 usado pelo cliente.
const WAMP_SUBSCRIBE = 5;
const WAMP_EVENT = 8;

/** Assina todos os eventos JSON da API do cliente e emite 'event' / 'close'. */
export class LcuSocket extends EventEmitter {
  private socket: WebSocket | null = null;

  connect(credentials: LcuCredentials): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`wss://127.0.0.1:${credentials.port}/`, 'wamp', {
        headers: { Authorization: authHeader(credentials) },
        rejectUnauthorized: false,
      });
      this.socket = socket;

      socket.once('open', () => {
        socket.send(JSON.stringify([WAMP_SUBSCRIBE, 'OnJsonApiEvent']));
        resolve();
      });
      socket.once('error', reject);
      socket.on('close', () => {
        this.socket = null;
        this.emit('close');
      });
      socket.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (Array.isArray(message) && message[0] === WAMP_EVENT) {
            this.emit('event', message[2] as LcuEvent);
          }
        } catch {
          // Mensagens vazias ou fora do formato são ignoradas.
        }
      });
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
