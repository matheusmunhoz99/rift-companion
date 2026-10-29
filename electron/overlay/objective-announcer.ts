import type { LcuConnector } from '../lcu/connector';
import { fetchRawGameData } from './live-client';
import { toLiveDashboard, type ObjectiveTimings, type RawDashboardData } from './live-dashboard';
import { objectiveAlerts } from './objective-alerts';

const POLL_MS = 3_000;

/**
 * Durante a partida, manda os avisos de objetivos (dragão, Barão, Arauto, Larvas,
 * inibidores) pelo contato Rift Companion no chat do LoL: só você vê. O contato existe
 * pelo proxy do modo invisível, então sem ele (ou com a opção desligada) nada é enviado.
 */
export class ObjectiveAnnouncer {
  private timer: NodeJS.Timeout | null = null;
  private sent = new Set<string>();
  private greeted = false;

  constructor(
    private readonly connector: LcuConnector,
    private readonly chat: { hasActiveChat(): boolean; sendBuddyMessages(lines: string[]): void },
    private readonly enabled: () => boolean,
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

  private async poll(): Promise<void> {
    if (!this.enabled() || !this.chat.hasActiveChat()) return;
    const raw = await fetchRawGameData().catch(() => null);
    if (!raw?.allPlayers?.length || !this.timer) return;
    const dashboard = toLiveDashboard(raw as RawDashboardData, await this.timings());
    // Fora do Summoner's Rift (ARAM, Arena...) não há objetivos com tempo marcado.
    if (!dashboard.objectives.length && !dashboard.timers) return;
    const lines: string[] = [];
    if (!this.greeted) {
      this.greeted = true;
      lines.push('Partida começou: aviso aqui 1 min antes de cada objetivo nascer. Dá para desligar em Configurações › Overlay.');
    }
    for (const alert of objectiveAlerts(dashboard, this.sent)) {
      this.sent.add(alert.id);
      lines.push(alert.text);
    }
    if (lines.length) this.chat.sendBuddyMessages(lines);
  }
}
