import { BUDDY_ID, BUDDY_JID } from '../invisible/buddy';
import type { LcuConnector } from '../lcu/connector';
import type { LcuCredentials } from '../lcu/credentials';
import { lcuRequest } from '../lcu/http';
import { fetchRawGameData } from './live-client';
import { toLiveDashboard, type ObjectiveTimings, type RawDashboardData } from './live-dashboard';
import { objectiveAlerts } from './objective-alerts';

const POLL_MS = 1_000;
const POST_GAME_CLEAR_DELAY_MS = 4_000;

/**
 * Apaga as mensagens enviadas ao contato local Rift Companion e fecha/silencia a conversa
 * no cliente do LoL ao fim da partida, evitando notificações não lidas acumuladas.
 */
export async function clearBuddyChat(
  credentials: LcuCredentials | null,
  request: typeof lcuRequest = lcuRequest,
): Promise<void> {
  if (!credentials) return;
  const list = await request<Array<{ id?: string; pid?: string }>>(
    credentials,
    'GET',
    '/lol-chat/v1/conversations',
  ).catch(() => null);
  const ids = Array.isArray(list)
    ? list
        .filter((c) => c.id?.includes(BUDDY_ID) || c.pid?.includes(BUDDY_ID))
        .map((c) => c.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const targets = ids.length ? [...new Set(ids)] : list ? [] : [BUDDY_JID];
  for (const id of targets) {
    const encoded = encodeURIComponent(id);
    await request(credentials, 'DELETE', `/lol-chat/v1/conversations/${encoded}/messages`).catch(() => undefined);
    await request(credentials, 'PUT', `/lol-chat/v1/conversations/${encoded}`, {
      isMuted: true,
      unreadMessageCount: 0,
    }).catch(() => undefined);
    await request(credentials, 'DELETE', `/lol-chat/v1/conversations/${encoded}`).catch(() => undefined);
  }
}

/** Onde os avisos saem: chat do LoL e voz. Cada um liga e desliga nas configurações. */
export interface AnnouncerOutputs {
  /** Contato Rift Companion no chat do LoL (só você vê); existe pelo proxy do modo invisível. */
  chat: { hasActiveChat(): boolean; sendBuddyMessages(lines: string[]): void };
  chatEnabled(): boolean;
  /** Limpa e fecha a conversa do contato no fim da partida para não poluir o chat do LoL. */
  clearChat?: () => Promise<void> | void;
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
  private clearTimer: NodeJS.Timeout | null = null;
  private sent = new Set<string>();
  private greeted = false;
  private sentToChat = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly outputs: AnnouncerOutputs,
    private readonly timings: () => Promise<ObjectiveTimings>,
    private readonly rawGameData: () => Promise<unknown> = fetchRawGameData,
  ) {
    connector.on('state', () => this.sync());
  }

  sync(): void {
    const phase = this.connector.getState().gameflowPhase;
    const inGame = phase === 'InProgress' || phase === 'Reconnect';
    if (inGame && !this.timer) {
      if (this.clearTimer) {
        clearTimeout(this.clearTimer);
        this.clearTimer = null;
      }
      this.timer = setInterval(() => void this.poll(), POLL_MS);
      void this.poll();
    } else if (!inGame && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Partida nova começa sem avisos enviados.
      this.sent = new Set();
      this.greeted = false;
      if (this.sentToChat) {
        this.sentToChat = false;
        void this.outputs.clearChat?.();
        this.clearTimer = setTimeout(() => {
          this.clearTimer = null;
          void this.outputs.clearChat?.();
        }, POST_GAME_CLEAR_DELAY_MS);
        this.clearTimer.unref();
      }
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
    const raw = (await this.rawGameData().catch(() => null)) as RawDashboardData & { allPlayers?: unknown[] } | null;
    if (!raw?.allPlayers?.length || !this.timer) return;
    const dashboard = toLiveDashboard(raw as RawDashboardData, await this.timings());
    // Fora do Summoner's Rift (ARAM, Arena...) não há objetivos com tempo marcado.
    if (!dashboard.objectives.length && !dashboard.timers) return;
    const lines: string[] = [];
    if (chat && !this.greeted) {
      this.greeted = true;
      lines.push('Partida começou: aviso aqui 1 min 30 s e 30 s antes de cada objetivo nascer, e quando ele nasce. Dá para desligar em Configurações › Durante a partida.');
    }
    // Os avisos são marcados como enviados mesmo com uma das saídas desligada: ligar no meio
    // da partida não despeja de uma vez os que já passaram.
    for (const alert of objectiveAlerts(dashboard, this.sent)) {
      this.sent.add(alert.id);
      lines.push(alert.text);
      if (voice && alert.speech) this.outputs.speak(alert.speech);
    }
    if (chat && lines.length) {
      this.sentToChat = true;
      this.outputs.chat.sendBuddyMessages(lines);
    }
  }
}
