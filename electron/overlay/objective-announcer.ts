import type { LcuConnector } from '../lcu/connector';
import { fetchRawGameData } from './live-client';
import { toLiveDashboard, type ObjectiveTimings, type RawDashboardData } from './live-dashboard';
import { objectiveAlerts } from './objective-alerts';

const POLL_MS = 1_000;

/** Onde os avisos saem: chat do LoL e voz. Cada um liga e desliga nas configurações. */
export interface AnnouncerOutputs {
  /** Contato Rift Companion no chat do LoL (só você vê); existe pelo proxy do modo invisível. */
  chat: { hasActiveChat(): boolean; sendBuddyMessages(lines: string[]): void };
  chatEnabled(): boolean;
  /** Fala a frase em voz alta (a tela principal tem a voz do Windows em português). */
  speak(text: string): void;
  voiceEnabled(): boolean;
}

/**
 * Durante a partida, avisa os objetivos (dragão, Barão, Arauto, Larvas, inibidores) pelo
 * contato Rift Companion no chat do LoL e em voz alta. Cada aviso sai uma vez por partida.
 */
export class ObjectiveAnnouncer {
  private timer: NodeJS.Timeout | null = null;
  private sent = new Set<string>();
  private greeted = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly outputs: AnnouncerOutputs,
    private readonly timings: () => Promise<ObjectiveTimings>,
  ) {
    connector.on('state', () => this.sync());
  }

  sync(): void {
    const phase = this.connector.getState().gameflowPhase;
    const inGame = phase === 'InProgress' || phase === 'Reconnect';
    if (inGame && !this.timer) {
      this.timer = setInterval(() => void this.poll(), POLL_MS);
      void this.poll();
    } else if (!inGame && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Partida nova começa sem avisos enviados.
      this.sent = new Set();
      this.greeted = false;
    }
  }

  private polling = false;

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.read();
    } finally {
      this.polling = false;
    }
  }

  private async read(): Promise<void> {
    const chat = this.outputs.chatEnabled() && this.outputs.chat.hasActiveChat();
    const voice = this.outputs.voiceEnabled();
    if (!chat && !voice) return;
    const raw = await fetchRawGameData().catch(() => null);
    if (!raw?.allPlayers?.length || !this.timer) return;
    const dashboard = toLiveDashboard(raw as RawDashboardData, await this.timings());
    // Fora do Summoner's Rift (ARAM, Arena...) não há objetivos com tempo marcado.
    if (!dashboard.objectives.length && !dashboard.timers) return;
    const lines: string[] = [];
    if (chat && !this.greeted) {
      this.greeted = true;
      lines.push('Partida começou: aviso aqui 1 min 30 s e 30 s antes de cada objetivo nascer, e quando ele nasce. Dá para desligar em Configurações › Overlay.');
    }
    // Os avisos são marcados como enviados mesmo com uma das saídas desligada: ligar no meio
    // da partida não despeja de uma vez os que já passaram.
    for (const alert of objectiveAlerts(dashboard, this.sent)) {
      this.sent.add(alert.id);
      lines.push(alert.text);
      if (voice && alert.speech) this.outputs.speak(alert.speech);
    }
    if (chat && lines.length) this.outputs.chat.sendBuddyMessages(lines);
  }
}
