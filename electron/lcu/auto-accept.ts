import type { EventEmitter } from 'node:events';
import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';
import type { LcuEvent } from './socket';

interface ReadyCheck {
  state: string;
  playerResponse: string;
}

/**
 * Aceita a partida quando a fila encontra jogo. Só responde a ready checks em
 * andamento e ainda sem resposta: se o jogador recusou, nada é enviado.
 */
export class AutoAccept {
  private accepting = false;

  constructor(
    events: EventEmitter,
    private readonly getCredentials: () => LcuCredentials | null,
    private readonly isEnabled: () => boolean,
    private readonly onAccepted: () => void = () => {},
  ) {
    events.on('lcu-event', (event: LcuEvent) => void this.handle(event));
  }

  private async handle(event: LcuEvent): Promise<void> {
    if (event.uri !== '/lol-matchmaking/v1/ready-check' || event.eventType === 'Delete') return;
    const readyCheck = event.data as ReadyCheck | null;
    if (readyCheck?.state !== 'InProgress' || readyCheck.playerResponse !== 'None') return;
    if (!this.isEnabled() || this.accepting) return;

    const credentials = this.getCredentials();
    if (!credentials) return;

    this.accepting = true;
    try {
      await lcuRequest(credentials, 'POST', '/lol-matchmaking/v1/ready-check/accept');
      this.onAccepted();
    } catch (error) {
      console.warn('[auto-accept] Falha ao aceitar a partida:', error);
    } finally {
      this.accepting = false;
    }
  }
}
