import { Component, computed, inject, input, signal } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import type { ChampSelectState, TeamMember, Trade } from '../lcu/lcu.types';

const POSITION_LABELS: Record<string, string> = {
  top: 'Topo',
  jungle: 'Selva',
  middle: 'Meio',
  bottom: 'Atirador',
  utility: 'Suporte',
};

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-champ-select-panel',
  templateUrl: './champ-select-panel.html',
  styleUrl: './champ-select-panel.scss',
})
export class ChampSelectPanel {
  readonly session = input.required<ChampSelectState>();

  protected readonly ddragon = inject(DataDragonService);
  protected readonly busy = signal<string | null>(null);
  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly search = signal('');

  protected readonly myChampion = computed(() => {
    const session = this.session();
    const championId = session.championId || session.pickIntentChampionId;
    return championId ? this.ddragon.champion(championId) : null;
  });

  protected readonly position = computed(
    () => POSITION_LABELS[this.session().assignedPosition] ?? null,
  );

  /** Campeões da escolha atual, filtrados pela busca e em ordem alfabética. */
  protected readonly pickable = computed(() => {
    const term = normalize(this.search());
    const candidates = this.session().banActionId != null
      ? this.ddragon.championList()
      : this.session().pickableChampionIds.map((id) => this.ddragon.champion(id));
    return candidates
      .filter((champion): champion is ChampionInfo => champion !== null)
      .filter((champion) => !term || normalize(champion.name).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  protected readonly teammates = computed(() => this.session().team.filter((member) => !member.isMe));

  protected champion(id: number): ChampionInfo | null {
    return id ? this.ddragon.champion(id) : null;
  }

  protected iconUrl(id: number): string | null {
    const champion = this.champion(id);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected tradeFor(member: TeamMember): Trade | null {
    return this.session().trades.find((trade) => trade.cellId === member.cellId) ?? null;
  }

  protected pick(champion: ChampionInfo): Promise<void> {
    if (this.session().banActionId != null) {
      return this.run(`ban:${champion.key}`, () => window.champSelect!.ban(champion.key), `${champion.name} banido.`);
    }
    return this.run(`pick:${champion.key}`, () => window.champSelect!.pick(champion.key), `${champion.name} escolhido.`);
  }

  protected swap(championId: number): Promise<void> {
    const name = this.champion(championId)?.name ?? 'Campeão';
    return this.run(`bench:${championId}`, () => window.champSelect!.benchSwap(championId), `Trocado por ${name}.`);
  }

  protected reroll(): Promise<void> {
    return this.run('reroll', () => window.champSelect!.reroll(), 'Campeão sorteado de novo.');
  }

  protected respond(trade: Trade, action: 'request' | 'accept' | 'decline'): Promise<void> {
    const messages = {
      request: 'Pedido de troca enviado.',
      accept: 'Troca aceita.',
      decline: 'Troca recusada.',
    };
    return this.run(`trade:${trade.id}`, () => window.champSelect!.trade(trade.id, action), messages[action]);
  }

  private async run(key: string, action: () => Promise<void>, success: string): Promise<void> {
    if (!window.champSelect) return;
    this.busy.set(key);
    this.feedback.set(null);
    try {
      await action();
      this.feedback.set({ kind: 'success', text: success });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.feedback.set({
        kind: 'error',
        text: text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''),
      });
    } finally {
      this.busy.set(null);
    }
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
