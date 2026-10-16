import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationService } from '../core/navigation.service';
import { ToastService, errorText } from '../core/toast.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { LcuService } from '../lcu/lcu.service';
import type { Friend, LobbyMember, PlayerSlot, Position, QueueOption } from '../lcu/lcu.types';
import { queueName } from '../riot/labels';
import { Icon } from '../ui/icon';

export const POSITION_LABELS: Record<Position, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
  FILL: 'Preencher',
  UNSELECTED: 'Sem rota',
};

const SELECTABLE: Position[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL'];
const SLOT_POSITIONS: Position[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** Ordem e agrupamento das filas na tela. */
const QUEUE_ORDER = [420, 440, 400, 480, 450, 2400, 1700, 1750, 700, 720];

interface QueueGroup {
  title: string;
  queues: QueueOption[];
}

const BUSY_STATUSES = new Set(['inGame', 'championSelect', 'inQueue']);

const AVAILABILITY_LABELS: Record<string, string> = {
  chat: 'Online',
  away: 'Ausente',
  dnd: 'Ocupado',
  mobile: 'No celular',
  offline: 'Offline',
};

const GAME_STATUS_LABELS: Record<string, string> = {
  outOfGame: 'No cliente',
  inQueue: 'Na fila',
  championSelect: 'Na seleção',
  inGame: 'Em partida',
  hosting_NORMAL: 'Em sala',
  hosting_RANKED_SOLO_5x5: 'Em sala',
};

@Component({
  selector: 'app-play-view',
  imports: [Icon],
  templateUrl: './play-view.html',
  styleUrl: './play-view.scss',
})
export class PlayView {
  private readonly lcu = inject(LcuService);
  private readonly toast = inject(ToastService);
  protected readonly nav = inject(NavigationService);
  protected readonly ddragon = inject(DataDragonService);

  protected readonly state = this.lcu.state;
  protected readonly queues = signal<QueueOption[]>([]);
  protected readonly friends = signal<Friend[]>([]);
  protected readonly friendSearch = signal('');
  protected readonly busy = signal<string | null>(null);

  protected readonly positions = SELECTABLE;
  protected readonly positionLabels = POSITION_LABELS;

  protected readonly lobby = computed(() => this.state().lobby);
  protected readonly connected = computed(() => this.state().status === 'connected');

  protected readonly queueGroups = computed<QueueGroup[]>(() => {
    const sorted = [...this.queues()].sort((a, b) => rank(a.id) - rank(b.id));
    const groups: QueueGroup[] = [
      { title: "Summoner's Rift", queues: sorted.filter((q) => q.group === 'kSummonersRift' && q.category === 'PvP') },
      { title: 'ARAM', queues: sorted.filter((q) => q.group === 'kARAM') },
      {
        title: 'Outros modos',
        queues: sorted.filter(
          (q) => q.category === 'PvP' && q.group !== 'kSummonersRift' && q.group !== 'kARAM',
        ),
      },
      { title: 'Contra a IA', queues: sorted.filter((q) => q.category === 'VersusAi') },
    ];
    return groups.filter((group) => group.queues.length > 0);
  });

  protected readonly currentQueue = computed(() => {
    const lobby = this.lobby();
    return lobby ? (this.queues().find((q) => q.id === lobby.queueId) ?? null) : null;
  });

  protected readonly me = computed(() => {
    const lobby = this.lobby();
    const summoner = this.state().summoner;
    if (!lobby || !summoner) return null;
    return lobby.members.find((m) => m.puuid === summoner.puuid) ?? null;
  });

  protected readonly emptySlots = computed(() => {
    const lobby = this.lobby();
    return lobby ? Math.max(lobby.maxLobbySize - lobby.members.length, 0) : 0;
  });

  /** Jogo Dinâmico: dois slots de campeão + rota em vez da escolha de rotas comum. */
  protected readonly slotMode = computed(() => {
    const lobby = this.lobby();
    return !!lobby && (lobby.localPlayerSlots.length > 0 || !!this.currentQueue()?.showQuickPlaySlotSelection);
  });
  protected readonly slotPositions = SLOT_POSITIONS;
  protected readonly champions = signal<number[]>([]);
  protected readonly pickingSlot = signal<number | null>(null);
  protected readonly championSearch = signal('');

  protected readonly pickerChampions = computed(() => {
    const term = normalize(this.championSearch());
    const available = new Set(this.champions());
    return this.ddragon
      .championList()
      .filter((champion) => available.size === 0 || available.has(champion.key))
      .filter((champion) => !term || normalize(champion.name).includes(term));
  });

  protected readonly searching = computed(() => this.state().search?.searchState === 'Searching');

  protected readonly visibleFriends = computed(() => {
    const term = this.friendSearch().toLowerCase().trim();
    return this.friends().filter((f) => !term || `${f.gameName}#${f.tagLine}`.toLowerCase().includes(term));
  });

  constructor() {
    // Carrega filas e amigos ao conectar.
    effect(() => {
      if (this.connected()) untracked(() => void this.refresh());
    });
  }

  /**
   * Filas e amigos. Logo após abrir o app o processo principal pode ainda estar
   * conectando ao cliente; nesse caso tenta de novo algumas vezes.
   */
  async refresh(attempt = 0): Promise<void> {
    if (!window.lobby) return;
    const [queues, friends] = await Promise.all([
      window.lobby.queues().catch(() => null),
      window.lobby.friends().catch(() => null),
    ]);
    if (queues) this.queues.set(queues);
    if (friends) this.friends.set(friends);
    if ((!queues || !friends) && attempt < 5 && this.connected()) {
      setTimeout(() => void this.refresh(attempt + 1), 2000);
    }
  }

  /** Nome da fila da sala, mesmo antes da lista de filas carregar. */
  protected lobbyQueueName(queueId: number): string {
    return this.currentQueue()?.name ?? queueName(queueId);
  }

  protected positionLabel(position: string): string {
    return POSITION_LABELS[position as Position] ?? position;
  }

  protected slot(index: number): PlayerSlot | null {
    return this.lobby()?.localPlayerSlots[index] ?? null;
  }

  protected async openPicker(index: number): Promise<void> {
    this.championSearch.set('');
    this.pickingSlot.set(index);
    if (this.champions().length === 0 && window.lobby) {
      this.champions.set(await window.lobby.champions().catch(() => []));
    }
  }

  protected chooseChampion(championId: number): Promise<void> {
    const index = this.pickingSlot();
    if (index === null) return Promise.resolve();
    // Slot vazio: começa numa rota válida, de preferência a prioritária.
    const current = this.slot(index)?.positionPreference;
    const position =
      current && this.slotPositionAllowed(index, current)
        ? current
        : ([...this.scarce(), ...SLOT_POSITIONS].find((p) => this.slotPositionAllowed(index, p)) ?? 'FILL');
    this.pickingSlot.set(null);
    return this.run(`slot:${index}`, () => window.lobby!.setSlot(index, championId, position));
  }

  /** Rotas prioritárias da sala (o cliente exige uma delas entre os dois slots). */
  protected readonly scarce = computed(() => this.lobby()?.scarcePositions ?? []);

  protected scarceLabels(): string {
    return this.scarce().map((p) => this.positionLabel(p)).join(' ou ');
  }

  /** A rota é válida para o slot se não repete a do outro e mantém uma prioritária no par. */
  protected slotPositionAllowed(index: number, position: string): boolean {
    const other = this.slot(1 - index)?.positionPreference;
    if (other === position) return false;
    const scarce = this.scarce();
    return scarce.length === 0 || scarce.includes(position) || (!!other && scarce.includes(other));
  }

  protected setSlotPosition(index: number, position: string): Promise<void> {
    const slot = this.slot(index);
    if (!slot?.championId) return Promise.resolve();
    return this.run(`slot:${index}`, () => window.lobby!.setSlot(index, slot.championId, position));
  }

  protected createLobby(queue: QueueOption): Promise<void> {
    return this.run(`queue:${queue.id}`, () => window.lobby!.create(queue.id));
  }

  protected leave(): Promise<void> {
    return this.run('leave', () => window.lobby!.leave());
  }

  protected setPosition(slot: 'first' | 'second', position: Position): Promise<void> {
    const me = this.me();
    if (!me) return Promise.resolve();
    let first = slot === 'first' ? position : me.firstPosition;
    let second = slot === 'second' ? position : me.secondPosition;
    // Mesma rota nas duas opções não é aceita; Preencher não precisa de secundária.
    if (first === second) second = slot === 'first' ? 'UNSELECTED' : second;
    if (first === 'FILL') second = 'UNSELECTED';
    if (first === 'UNSELECTED') first = 'FILL';
    return this.run(`pos:${slot}:${position}`, () => window.lobby!.setPositions(first, second));
  }

  protected toggleSearch(): Promise<void> {
    const start = !this.searching();
    return this.run('search', () => window.lobby!.search(start));
  }

  protected invite(friend: Friend): Promise<void> {
    return this.run(`invite:${friend.summonerId}`, async () => {
      await window.lobby!.invite(friend.summonerId);
      this.toast.show(`Convite enviado para ${friend.gameName}.`, 'success');
    });
  }

  protected invited(friend: Friend): boolean {
    return !!this.lobby()?.invitations.some(
      (inv) => inv.toSummonerId === friend.summonerId && inv.state === 'Pending',
    );
  }

  protected inLobby(friend: Friend): boolean {
    return !!this.lobby()?.members.some((m) => m.summonerId === friend.summonerId);
  }

  /** Só convida quem está no cliente do LoL e livre (não em partida, seleção ou fila). */
  protected canInvite(friend: Friend): boolean {
    if (friend.availability === 'offline' || friend.availability === 'mobile' || this.inLobby(friend)) return false;
    return !BUSY_STATUSES.has(friend.gameStatus);
  }

  protected friendStatus(friend: Friend): string {
    return GAME_STATUS_LABELS[friend.gameStatus] ?? AVAILABILITY_LABELS[friend.availability] ?? friend.availability;
  }

  protected openMember(member: LobbyMember): void {
    if (member.tagLine) this.nav.openPlayer(`${member.gameName}#${member.tagLine}`, this.state().platformId);
  }

  protected openFriend(friend: Friend): void {
    this.nav.openPlayer(`${friend.gameName}#${friend.tagLine}`, this.state().platformId);
  }

  protected elapsed(): string {
    const search = this.state().search;
    return search ? clock(search.timeInQueue) : '0:00';
  }

  protected estimate(): string {
    const search = this.state().search;
    return search && search.estimatedQueueTime > 0 ? clock(search.estimatedQueueTime) : '—';
  }

  protected slots(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  private async run(key: string, action: () => Promise<void>): Promise<void> {
    if (!window.lobby) return;
    this.busy.set(key);
    try {
      await action();
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    } finally {
      this.busy.set(null);
    }
  }
}

function rank(queueId: number): number {
  const index = QUEUE_ORDER.indexOf(queueId);
  return index < 0 ? QUEUE_ORDER.length + queueId / 10000 : index;
}

function clock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
