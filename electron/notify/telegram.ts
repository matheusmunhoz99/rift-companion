import { shell } from 'electron';
import { ipcMain } from '../mobile/rpc';
import { banChampion, pickChampion, rerollChampion, swapWithBench } from '../lcu/champ-select';
import type { LcuConnector, LcuState } from '../lcu/connector';
import type { LcuCredentials } from '../lcu/credentials';
import { lcuRequest } from '../lcu/http';
import {
  cancelSearch,
  createLobby,
  getAvailableChampions,
  getFriends,
  getQueues,
  inviteFriend,
  leaveLobby,
  setPlayerSlot,
  setPositions,
  startSearch,
  type PlayerSlot,
  type Position,
  type QueueOption,
  type RawLobby,
} from '../lcu/lobby';
import type { LeagueLaunchResult } from '../lcu/riot-client';
import { applyRunePage, getRecommendedRunePages, type RunePageSuggestion } from '../lcu/perks';
import { applySummonerSpells } from '../lcu/spells';
import { fetchRawGameData } from '../overlay/live-client';
import { RIFT_API_URL } from '../riot/ipc';
import type { Settings } from '../settings';

/** Junta mudanças rápidas do cliente num único redesenho do painel. */
const RENDER_DEBOUNCE_MS = 500;
/** Espera o campeão do ARAM parar de mudar (rerrolagem, troca) antes do aviso. */
const CHAMPION_SETTLE_MS = 2_000;
/** Quanto tempo esperar a pessoa tocar em "Iniciar" no bot. */
const LINK_TIMEOUT_MS = 10 * 60_000;
/** Quantos campeões sugerir nos botões. */
const SUGGESTIONS = 8;
/** Durante o carregamento, confere a cada 1,5 s se a partida já começou (evento GameStart do jogo). */
const GAME_START_POLL_MS = 1_500;
/** Telas de carregamento longas (reconexão, PC lento): desiste depois disso. */
const GAME_START_TIMEOUT_MS = 10 * 60_000;

const LANES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const LANE_NAMES: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
  FILL: 'Preencher',
  UNSELECTED: '—',
};
/** Filas mais comuns primeiro. */
const QUEUE_ORDER = [420, 440, 400, 480, 490, 450, 2400, 1700, 900, 1900];

interface ChampionSummary {
  id: number;
  name: string;
  alias: string;
}

interface Button {
  text: string;
  action: string;
}

interface Panel {
  text: string;
  image?: string | null;
  keyboard?: Button[][];
}

interface EndOfGameStats {
  gameLength?: number;
  localPlayer?: { championId: number; stats?: Record<string, number> };
  teams?: Array<{ isPlayerTeam: boolean; isWinningTeam: boolean }>;
}

interface TierEntry {
  championId: number;
  position: string;
  games: number;
  banRate: number;
}

interface ChampionStats {
  position: string | null;
  runes?: Array<{ key: string; winRate: number; share: number }>;
  spells?: Array<{ key: string }>;
}

/** Submenu aberto no painel; "auto" mostra a tela do momento do cliente. */
type View =
  | { kind: 'auto' }
  | { kind: 'queues' }
  | { kind: 'lane1' }
  | { kind: 'lane2'; first: string }
  | { kind: 'slotlane'; slot: number }
  | { kind: 'slotchamp'; slot: number; lane: string }
  | { kind: 'friends' }
  | { kind: 'confirm-close' };

/**
 * Painel do LoL no Telegram: uma mensagem só, que se redesenha conforme o
 * cliente (menu, sala, fila, seleção, partida, resultado) e os botões tocados.
 * Avisos importantes chegam como mensagem nova (tocam no celular) e substituem
 * o painel. Roda no processo principal: funciona com a janela na bandeja.
 */
export class TelegramNotifications {
  private state: LcuState | null = null;
  private view: View = { kind: 'auto' };
  /** Confirmação curta mostrada no topo do painel ("Runas aplicadas", erros...). */
  private note: string | null = null;
  private pendingNotify = false;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPanel = '';
  private rendering = false;
  private renderAgain = false;

  private champions = new Map<number, ChampionSummary>();
  private spellNames = new Map<number, string>();
  private perkNames = new Map<number, string>();
  private queues = new Map<number, QueueOption>();
  private tierList: TierEntry[] = [];
  private tierListAt = 0;
  private statsCache = new Map<string, ChampionStats | null>();
  private lastChampionId = 0;
  private searchStartedAt: number | null = null;
  private result: EndOfGameStats | null = null;
  /** A partida já passou do carregamento (os campeões apareceram no Nexus). */
  private gameStarted = false;
  private gameWatch = 0;
  private aramTimer: ReturnType<typeof setTimeout> | null = null;
  private linking: { cancelled: boolean } | null = null;

  constructor(
    private readonly connector: LcuConnector,
    private readonly settings: Settings,
    private readonly launchLeague: () => Promise<LeagueLaunchResult>,
  ) {
    connector.on('state', (state: LcuState) => this.onState(state));
    this.registerIpc();
    void this.commandLoop();
  }

  private get device(): string | null {
    return this.settings.getTelegramDevice();
  }

  // ---- Estado do cliente -> painel ----

  private onState(state: LcuState): void {
    const before = this.state;
    this.state = state;
    if (!this.device || !before) return;
    const prefs = this.settings.getPreferences();
    const phase = state.gameflowPhase;
    const phaseChanged = phase !== before.gameflowPhase || state.status !== before.status;

    if (phaseChanged) {
      this.view = { kind: 'auto' };
      this.note = null;
      if (phase === 'Matchmaking') this.searchStartedAt ??= Date.now();
      else this.searchStartedAt = null;
      if (phase === 'ChampSelect') this.lastChampionId = 0;
      if (phase !== 'EndOfGame') this.result = null;
      // Avisos que tocam no celular.
      if (phase === 'ChampSelect' && prefs.telegramChampion) this.pendingNotify = true;
      // O aviso de início sai no evento GameStart (0:00 no jogo), não na tela de carregamento.
      this.gameStarted = false;
      if (phase === 'InProgress' || phase === 'Reconnect') void this.watchGameStart(prefs.telegramGameStart);
      if (phase === 'EndOfGame') void this.loadResult(prefs.telegramGameEnd);
    }
    if (state.readyCheck && !before.readyCheck && prefs.telegramReadyCheck) this.pendingNotify = true;

    const session = state.champSelect;
    if (phase === 'ChampSelect' && session) {
      if (session.championId > 0) this.lastChampionId = session.championId;
      // ARAM: o campeão sorteado (ou trocado) chega como aviso depois que para de mudar.
      const beforeChampion = before.champSelect?.championId ?? 0;
      if (session.benchEnabled && session.championId > 0 && session.championId !== beforeChampion && prefs.telegramChampion) {
        if (this.aramTimer) clearTimeout(this.aramTimer);
        this.aramTimer = setTimeout(() => {
          this.aramTimer = null;
          this.pendingNotify = true;
          this.scheduleRender(0);
        }, CHAMPION_SETTLE_MS);
      }
      // Vez de banir ou escolher: avisa no celular.
      if (
        (session.banActionId !== null && session.banActionId !== before.champSelect?.banActionId) ||
        (session.pickActionId !== null && session.pickActionId !== before.champSelect?.pickActionId)
      ) {
        if (prefs.telegramChampion) this.pendingNotify = true;
        this.view = { kind: 'auto' };
      }
    }
    this.scheduleRender();
  }

  private scheduleRender(delay = RENDER_DEBOUNCE_MS): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      void this.render();
    }, delay);
  }

  /** Redesenha o painel; só envia se mudou (ou se é um aviso). */
  private async render(force = false): Promise<void> {
    if (!this.device) return;
    if (this.rendering) {
      this.renderAgain = true;
      return;
    }
    this.rendering = true;
    try {
      const panel = await this.buildPanel();
      const notify = this.pendingNotify;
      const signature = JSON.stringify(panel);
      if (!force && !notify && signature === this.lastPanel) return;
      this.pendingNotify = false;
      this.lastPanel = signature;
      await this.api('POST', '/v1/notify/send', { ...panel, mode: 'panel', notify });
    } catch (error) {
      console.warn('[telegram] Falha ao atualizar o painel:', error instanceof Error ? error.message : error);
    } finally {
      this.rendering = false;
      if (this.renderAgain) {
        this.renderAgain = false;
        void this.render();
      }
    }
  }

  private async buildPanel(): Promise<Panel> {
    const panel = await this.screen();
    const note = this.note ? `${this.note}\n\n` : '';
    return { ...panel, text: `${note}${panel.text}` };
  }

  /** A tela certa para o momento: submenu aberto ou a fase do cliente. */
  private async screen(): Promise<Panel> {
    const state = this.state;
    const credentials = this.connector.getCredentials();
    if (!state || state.status !== 'connected' || !credentials) return this.closedScreen();

    switch (this.view.kind) {
      case 'queues':
        return this.queuesScreen(credentials);
      case 'lane1':
        return this.lane1Screen();
      case 'lane2':
        return this.lane2Screen(this.view.first);
      case 'slotlane':
        return this.slotLaneScreen(credentials, this.view.slot);
      case 'slotchamp':
        return this.slotChampionScreen(credentials, this.view.slot, this.view.lane);
      case 'friends':
        return this.friendsScreen(credentials);
      case 'confirm-close':
        return {
          text: 'Fechar o cliente do LoL?',
          keyboard: [[{ text: 'Sim, fechar', action: 'quit:yes' }, { text: 'Cancelar', action: 'back' }]],
        };
    }

    if (state.readyCheck) return this.readyCheckScreen();
    switch (state.gameflowPhase) {
      case 'Lobby':
        return this.lobbyScreen(credentials);
      case 'Matchmaking':
        return this.matchmakingScreen();
      case 'ReadyCheck':
        return this.readyCheckScreen();
      case 'ChampSelect':
        return this.champSelectScreen();
      case 'InProgress':
      case 'Reconnect':
        return this.inGameScreen();
      case 'PreEndOfGame':
      case 'EndOfGame':
        return this.resultScreen();
      default:
        return this.homeScreen();
    }
  }

  private closedScreen(): Panel {
    return {
      text: 'O LoL está fechado no PC.',
      keyboard: [[{ text: 'Abrir o LoL', action: 'open' }]],
    };
  }

  private homeScreen(): Panel {
    const s = this.state?.summoner;
    const auto = this.settings.getPreferences().autoAccept;
    return {
      text: `${s ? `${s.gameName}#${s.tagLine}` : 'Rift Companion'} · no menu principal\n\nO que vamos jogar?`,
      keyboard: [
        [{ text: 'Jogar', action: 'menu:play' }],
        [{ text: `Aceite automático: ${auto ? 'ligado' : 'desligado'}`, action: `auto:${auto ? 'off' : 'on'}` }],
        [{ text: 'Fechar o LoL', action: 'quit' }],
      ],
    };
  }

  private async queuesScreen(credentials: LcuCredentials): Promise<Panel> {
    const queues = await getQueues(credentials);
    this.queues = new Map(queues.map((q) => [q.id, q]));
    const ordered = [...queues].sort((a, b) => queueRank(a.id) - queueRank(b.id)).slice(0, 10);
    return {
      text: 'Qual fila?',
      keyboard: [...rows(ordered.map((q) => ({ text: q.name, action: `queue:${q.id}` })), 2), [backButton()]],
    };
  }

  private async lobbyScreen(credentials: LcuCredentials): Promise<Panel> {
    const lobby = await lcuRequest<RawLobby>(credentials, 'GET', '/lol-lobby/v2/lobby').catch(() => null);
    if (!lobby) return this.homeScreen();
    const queue = await this.queue(credentials, lobby.gameConfig.queueId);
    const me = lobby.localMember;
    const lines = [`Sala: ${queue?.name ?? 'personalizada'} · ${lobby.members.length}/${lobby.gameConfig.maxLobbySize} jogadores`];
    const keyboard: Button[][] = [];
    let ready = true;

    if (queue?.showQuickPlaySlotSelection) {
      // Jogo Dinâmico: mostra as escolhas que o cliente já guardou.
      const slots = (me.playerSlots ?? []) as PlayerSlot[];
      const scarce = lobby.scarcePositions ?? [];
      for (const index of [0, 1]) {
        const slot = slots[index];
        const champion = slot?.championId ? await this.champion(slot.championId) : null;
        if (!champion || !slot?.positionPreference) ready = false;
        lines.push(
          `${index + 1}ª escolha: ${champion ? `${champion.name} · ${laneName(slot!.positionPreference)}` : 'não escolhida'}`,
        );
      }
      const lanes = slots.map((s) => s?.positionPreference).filter(Boolean);
      if (scarce.length > 0) {
        lines.push(`Prioritárias agora: ${scarce.map(laneName).join(', ')}`);
        if (lanes.length === 2 && !lanes.some((l) => scarce.includes(l))) {
          ready = false;
          lines.push('Uma das duas rotas precisa ser prioritária.');
        }
      }
      keyboard.push([
        { text: 'Mudar 1ª escolha', action: 'slot:0' },
        { text: 'Mudar 2ª escolha', action: 'slot:1' },
      ]);
    } else if (queue?.showPositionSelector) {
      const first = me.firstPositionPreference;
      const second = me.secondPositionPreference;
      if (!first || first === 'UNSELECTED') ready = false;
      lines.push(`Rotas: ${laneName(first || 'UNSELECTED')}${first === 'FILL' ? '' : ` e ${laneName(second || 'UNSELECTED')}`}`);
      keyboard.push([{ text: 'Mudar rotas', action: 'lanes' }]);
    }

    if (me.isLeader) {
      keyboard.unshift([
        ready
          ? { text: 'Procurar partida', action: 'search' }
          : { text: 'Escolha antes de procurar', action: queue?.showQuickPlaySlotSelection ? 'slot:0' : 'lanes' },
      ]);
    } else {
      lines.push('Só o dono da sala pode iniciar a fila.');
    }
    keyboard.push([
      { text: 'Convidar amigos', action: 'friends' },
      { text: 'Trocar fila', action: 'menu:play' },
    ]);
    keyboard.push([{ text: 'Sair da sala', action: 'leave' }]);
    return { text: lines.join('\n'), keyboard };
  }

  private lane1Screen(): Panel {
    return {
      text: 'Rota principal?',
      keyboard: [...rows([...LANES, 'FILL'].map((l) => ({ text: laneName(l), action: `lane1:${l}` })), 3), [backButton()]],
    };
  }

  private lane2Screen(first: string): Panel {
    return {
      text: `Principal: ${laneName(first)}. E a secundária?`,
      keyboard: [
        ...rows(
          [...LANES, 'FILL'].filter((l) => l !== first).map((l) => ({ text: laneName(l), action: `lane2:${first}:${l}` })),
          3,
        ),
        [backButton()],
      ],
    };
  }

  /** Rota de um slot do Jogo Dinâmico, respeitando a regra das rotas prioritárias. */
  private async slotLaneScreen(credentials: LcuCredentials, slot: number): Promise<Panel> {
    const lobby = await lcuRequest<RawLobby>(credentials, 'GET', '/lol-lobby/v2/lobby').catch(() => null);
    const scarce = lobby?.scarcePositions ?? [];
    const other = ((lobby?.localMember.playerSlots ?? []) as PlayerSlot[])[1 - slot]?.positionPreference ?? null;
    let lanes: string[] = LANES.filter((l) => l !== other);
    if (scarce.length > 0 && other && !scarce.includes(other)) lanes = lanes.filter((l) => scarce.includes(l));
    return {
      text: `Rota da ${slot + 1}ª escolha?${scarce.length ? `\nPrioritárias: ${scarce.map(laneName).join(', ')}` : ''}`,
      keyboard: [
        ...rows(
          lanes.map((l) => ({ text: `${laneName(l)}${scarce.includes(l) ? ' *' : ''}`, action: `slotlane:${slot}:${l}` })),
          2,
        ),
        [backButton()],
      ],
    };
  }

  private async slotChampionScreen(credentials: LcuCredentials, slot: number, lane: string): Promise<Panel> {
    const available = new Set(await getAvailableChampions(credentials));
    const ids = (await this.suggestedChampions(lane)).filter((id) => available.has(id)).slice(0, SUGGESTIONS);
    const buttons = await this.championButtons(ids, (id) => `slotchamp:${slot}:${lane}:${id}`);
    return {
      text: `Campeão para ${laneName(lane)}? Toque num deles ou digite o nome de qualquer campeão.`,
      keyboard: [...rows(buttons, 2), [backButton()]],
    };
  }

  private async friendsScreen(credentials: LcuCredentials): Promise<Panel> {
    const online = (await getFriends(credentials)).filter((f) => f.availability === 'chat' && f.gameStatus === 'outOfGame').slice(0, 12);
    return {
      text: online.length ? 'Convidar quem? (amigos online e livres)' : 'Nenhum amigo online e livre agora.',
      keyboard: [
        ...rows(online.map((f) => ({ text: f.gameName, action: `inv:${f.summonerId}` })), 2),
        [{ text: 'Atualizar', action: 'friends' }, backButton()],
      ],
    };
  }

  private matchmakingScreen(): Panel {
    const search = this.state?.search;
    const since = this.searchStartedAt ? new Date(this.searchStartedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
    const estimated = search && Number.isFinite(search.estimatedQueueTime) && search.estimatedQueueTime > 0 ? clock(search.estimatedQueueTime) : null;
    return {
      text: `Procurando partida…${since ? `\nNa fila desde ${since}` : ''}${estimated ? ` · tempo estimado ${estimated}` : ''}`,
      keyboard: [[{ text: 'Cancelar fila', action: 'cancelq' }]],
    };
  }

  private readyCheckScreen(): Panel {
    const auto = this.settings.getPreferences().autoAccept;
    const response = this.state?.readyCheck?.playerResponse;
    if (response === 'Accepted') return { text: 'Partida encontrada! Você aceitou. Esperando os outros jogadores…' };
    if (response === 'Declined') return { text: 'Partida encontrada, mas você recusou.' };
    return {
      text: auto ? 'Partida encontrada! O aceite automático está aceitando para você.' : 'Partida encontrada! Aceita?',
      keyboard: auto ? undefined : [[{ text: 'Aceitar', action: 'accept' }, { text: 'Recusar', action: 'decline' }]],
    };
  }

  private async champSelectScreen(): Promise<Panel> {
    const session = this.state!.champSelect;
    if (!session) return { text: 'Seleção de campeões…' };
    const position = (session.assignedPosition || '').toUpperCase();
    const lane = position ? ` · ${laneName(position)}` : '';

    // ARAM: campeão sorteado, banco e rerrolagem.
    if (session.benchEnabled) {
      const champion = session.championId ? await this.champion(session.championId) : null;
      const bench = (await Promise.all(session.benchChampionIds.map((id) => this.champion(id)))).filter(
        (c): c is ChampionSummary => !!c,
      );
      const keyboard = rows(bench.map((c) => ({ text: `Trocar por ${c.name}`, action: `swap:${c.id}` })), 2);
      const extra: Button[] = [];
      if (session.allowRerolling && session.rerollsRemaining > 0) extra.push({ text: `Rerrolar (${session.rerollsRemaining})`, action: 'reroll' });
      extra.push({ text: 'Runas recomendadas', action: 'runes:rec' });
      keyboard.push(extra);
      return {
        text: `ARAM: você está de ${champion?.name ?? '…'}.\n${bench.length ? `No banco: ${bench.map((c) => c.name).join(', ')}` : 'Banco vazio por enquanto.'}\n\nToque para trocar ou digite o nome de um campeão do banco.`,
        image: champion ? championArt(champion) : null,
        keyboard,
      };
    }

    if (session.banActionId !== null) {
      const allies = new Set(session.team.map((m) => m.championId).filter((id) => id > 0));
      const byBan = new Map<number, number>();
      for (const t of await this.allTierList()) byBan.set(t.championId, Math.max(byBan.get(t.championId) ?? 0, t.banRate));
      const ids = [...byBan.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => !allies.has(id)).slice(0, SUGGESTIONS);
      return {
        text: `Sua vez de banir${lane}! Os mais banidos no alto elo, ou digite o nome de qualquer campeão.`,
        keyboard: rows(await this.championButtons(ids, (id) => `ban:${id}`), 2),
      };
    }

    if (session.pickActionId !== null) {
      const pickable = new Set(session.pickableChampionIds);
      const ids = (await this.suggestedChampions(position)).filter((id) => pickable.size === 0 || pickable.has(id)).slice(0, SUGGESTIONS);
      return {
        text: `Sua vez de escolher${lane}! Seus campeões com mais maestria, ou digite o nome de qualquer um.`,
        keyboard: rows(await this.championButtons(ids, (id) => `pick:${id}`), 2),
      };
    }

    // Campeão travado: runas e feitiços Mestre+.
    if (session.championId > 0) {
      const champion = await this.champion(session.championId);
      const stats = await this.championStats(session.championId, position);
      const keyboard: Button[][] = [];
      for (const [index, rune] of (stats?.runes ?? []).slice(0, 2).entries()) {
        const keystone = Number(rune.key.split('|')[2]?.split(',')[0]);
        const name = (await this.perkName(keystone)) ?? 'Runas';
        keyboard.push([{ text: `${name} · ${pct(rune.winRate)} vitórias · ${pct(rune.share)} usam`, action: `runes:${index}` }]);
      }
      keyboard.push([{ text: 'Runas recomendadas pelo cliente', action: 'runes:rec' }]);
      for (const spell of (stats?.spells ?? []).slice(0, 2)) {
        const names = await Promise.all(spell.key.split(',').map((id) => this.spellName(Number(id))));
        keyboard.push([{ text: `Feitiços: ${names.join(' + ')}`, action: `spells:${spell.key}` }]);
      }
      return {
        text: `Você travou ${champion?.name ?? 'o campeão'}${lane}. Importar runas e feitiços? (Mestre+ do patch atual)`,
        image: champion ? championArt(champion) : null,
        keyboard,
      };
    }

    const intent = session.pickIntentChampionId ? await this.champion(session.pickIntentChampionId) : null;
    return { text: `Seleção de campeões${lane}. Esperando a sua vez…${intent ? `\nIntenção: ${intent.name}` : ''}` };
  }

  /** Espera o jogo sair do carregamento: o evento GameStart aparece na Live Client Data API em 0:00. */
  private async watchGameStart(notify: boolean): Promise<void> {
    const watch = ++this.gameWatch;
    const deadline = Date.now() + GAME_START_TIMEOUT_MS;
    while (watch === this.gameWatch && Date.now() < deadline) {
      const phase = this.state?.gameflowPhase;
      if (phase !== 'InProgress' && phase !== 'Reconnect') return;
      const raw = await fetchRawGameData();
      // Reconexão no meio da partida: o tempo já passou de 0 e o GameStart já ficou para trás.
      if (raw && (raw.events?.Events.some((e) => e.EventName === 'GameStart') || (raw.gameData?.gameTime ?? 0) > 5)) {
        this.gameStarted = true;
        if (notify) this.pendingNotify = true;
        this.scheduleRender(0);
        return;
      }
      await sleep(GAME_START_POLL_MS);
    }
  }

  private async inGameScreen(): Promise<Panel> {
    const champion = await this.champion(this.lastChampionId);
    if (!this.gameStarted) {
      return {
        text: `Tela de carregamento${champion ? ` · ${champion.name}` : ''}. Aviso aqui assim que a partida começar.`,
        image: champion ? championArt(champion) : null,
      };
    }
    const raw = await fetchRawGameData();
    let detail = '';
    if (raw) {
      const myId = raw.activePlayer?.riotId ?? '';
      const me = raw.allPlayers.find((p) => (p.riotId ?? p.summonerName) === myId);
      const minutes = Math.floor((raw.gameData?.gameTime ?? 0) / 60);
      if (me) {
        const s = me.scores;
        detail = `\n${minutes} min · KDA ${s.kills}/${s.deaths}/${s.assists} · ${s.creepScore} CS · nível ${me.level}`;
      }
    }
    return {
      text: `A partida começou!${champion ? ` Você está de ${champion.name}.` : ''} Boa sorte!${detail}`,
      image: champion ? championArt(champion) : null,
      keyboard: [[{ text: 'Atualizar', action: 'refresh' }]],
    };
  }

  private async resultScreen(): Promise<Panel> {
    const eog = this.result;
    const local = eog?.localPlayer;
    if (!eog || !local) return { text: 'A partida terminou.', keyboard: [[{ text: 'Jogar de novo', action: 'again' }]] };
    const won = eog.teams?.find((t) => t.isPlayerTeam)?.isWinningTeam ?? false;
    const s = local.stats ?? {};
    const kda = `${s['CHAMPIONS_KILLED'] ?? 0}/${s['NUM_DEATHS'] ?? 0}/${s['ASSISTS'] ?? 0}`;
    const cs = (s['MINIONS_KILLED'] ?? 0) + (s['NEUTRAL_MINIONS_KILLED'] ?? 0);
    const minutes = eog.gameLength ? Math.round(eog.gameLength / 60) : null;
    const champion = await this.champion(local.championId);
    return {
      text: `${won ? 'Vitória!' : 'Derrota.'}\n${[champion?.name, `KDA ${kda}`, `${cs} CS`, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ')}`,
      image: champion ? championArt(champion) : null,
      keyboard: [[{ text: 'Jogar de novo', action: 'again' }, { text: 'Menu', action: 'home' }]],
    };
  }

  private async loadResult(notify: boolean): Promise<void> {
    // As estatísticas do fim de jogo chegam alguns segundos depois da fase mudar.
    await sleep(4_000);
    this.result = await this.lcu<EndOfGameStats>('/lol-end-of-game/v1/eog-stats-block');
    if (notify) this.pendingNotify = true;
    this.scheduleRender(0);
  }

  // ---- Comandos vindos do Telegram ----

  /** Espera longa no servidor: o app recebe cada toque ou mensagem assim que chega. */
  private async commandLoop(): Promise<void> {
    for (;;) {
      if (!this.device) {
        await sleep(5_000);
        continue;
      }
      try {
        const { commands } = await this.api<{ commands: string[] }>('GET', '/v1/notify/commands?wait=1', undefined, true, 35_000);
        for (const command of commands) await this.handleCommand(command);
      } catch {
        await sleep(5_000);
      }
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const [name, ...args] = command.split(':');
    this.note = null;
    let force = false;
    let notify = false;

    try {
      // Comandos que não precisam do cliente aberto.
      if (name === 'open') {
        const how = await this.launchLeague();
        this.note =
          how === 'restarted'
            ? 'O LoL estava aberto sem o modo invisível: reiniciei e ele está abrindo invisível. Leva alguns segundos.'
            : how === 'waiting'
            ? 'O LoL está aberto sem o modo invisível. Quando a partida acabar, reinicio ele invisível.'
            : how === 'restart-required' || how === 'declined'
            ? 'Para ficar invisível, feche o Riot Client por completo e toque em Abrir de novo.'
            : how === 'already-open'
            ? 'O LoL já está aberto (ou terminando de abrir).'
            : how
              ? 'Abrindo o LoL… leva alguns segundos. Se pedir login, entre pelo PC.'
              : 'Não encontrei o Riot Client neste PC.';
        return;
      }
      if (name === 'menu' && args[0] === 'panel') {
        // /painel: manda o painel de novo no fim da conversa.
        this.view = { kind: 'auto' };
        notify = true;
        return;
      }
      const credentials = this.connector.getCredentials();
      if (!credentials) {
        this.note = 'O LoL está fechado no PC.';
        return;
      }

      switch (name) {
        case 'back':
        case 'home':
          this.view = { kind: 'auto' };
          break;
        case 'refresh':
          force = true;
          break;
        case 'menu':
          this.view = { kind: 'queues' };
          if (args[0] === 'play' && ['ChampSelect', 'InProgress'].includes(this.state?.gameflowPhase ?? '')) {
            this.view = { kind: 'auto' };
            this.note = 'Você já está numa partida.';
          }
          break;
        case 'auto':
          this.settings.updatePreferences({ autoAccept: args[0] === 'on' });
          this.note = `Aceite automático ${args[0] === 'on' ? 'ligado' : 'desligado'}.`;
          break;
        case 'quit':
          if (args[0] !== 'yes') {
            this.view = { kind: 'confirm-close' };
            break;
          }
          if (this.state?.gameflowPhase === 'InProgress') throw new Error('Você está em partida.');
          await lcuRequest(credentials, 'POST', '/process-control/v1/process/quit');
          this.view = { kind: 'auto' };
          this.note = 'LoL fechado.';
          break;
        case 'queue':
          await createLobby(credentials, Number(args[0]));
          this.view = { kind: 'auto' };
          break;
        case 'again':
          await lcuRequest(credentials, 'POST', '/lol-lobby/v2/play-again').catch(() => undefined);
          this.view = { kind: 'auto' };
          break;
        case 'lanes':
          this.view = { kind: 'lane1' };
          break;
        case 'lane1':
          if (args[0] === 'FILL') {
            await setPositions(credentials, 'FILL', 'UNSELECTED');
            this.view = { kind: 'auto' };
          } else this.view = { kind: 'lane2', first: args[0] };
          break;
        case 'lane2':
          await setPositions(credentials, args[0] as Position, args[1] as Position);
          this.view = { kind: 'auto' };
          break;
        case 'slot':
          this.view = { kind: 'slotlane', slot: Number(args[0]) };
          break;
        case 'slotlane':
          this.view = { kind: 'slotchamp', slot: Number(args[0]), lane: args[1] };
          break;
        case 'slotchamp':
          await this.chooseSlot(credentials, Number(args[0]), args[1], Number(args[2]));
          break;
        case 'friends':
          this.view = { kind: 'friends' };
          force = true;
          break;
        case 'inv': {
          await inviteFriend(credentials, Number(args[0]));
          this.note = 'Convite enviado.';
          break;
        }
        case 'leave':
          await leaveLobby(credentials);
          this.view = { kind: 'auto' };
          break;
        case 'search':
          await startSearch(credentials);
          this.searchStartedAt = Date.now();
          break;
        case 'cancelq':
          await cancelSearch(credentials);
          break;
        case 'accept':
        case 'decline':
          await lcuRequest(credentials, 'POST', `/lol-matchmaking/v1/ready-check/${name}`);
          break;
        case 'pick':
          await pickChampion(credentials, Number(args[0]));
          break;
        case 'ban':
          await banChampion(credentials, Number(args[0]));
          this.note = `Banido: ${(await this.champion(Number(args[0])))?.name ?? args[0]}.`;
          break;
        case 'swap':
          await swapWithBench(credentials, Number(args[0]));
          break;
        case 'reroll':
          await rerollChampion(credentials);
          break;
        case 'runes':
          this.note = await this.applyRunes(credentials, args[0]);
          break;
        case 'spells':
          await applySummonerSpells(credentials, args[0].split(',').map(Number));
          this.note = 'Feitiços aplicados.';
          break;
        case 'text':
          await this.typedChampion(credentials, command.slice('text:'.length));
          break;
      }
    } catch (error) {
      this.note = `Não deu: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (notify) this.pendingNotify = true;
      // Dá um instante para o cliente refletir a ação antes de redesenhar.
      await sleep(350);
      await this.render(force);
    }
  }

  private async chooseSlot(credentials: LcuCredentials, slot: number, lane: string, championId: number): Promise<void> {
    await setPlayerSlot(credentials, slot, championId, lane);
    const lobby = await lcuRequest<RawLobby>(credentials, 'GET', '/lol-lobby/v2/lobby').catch(() => null);
    const other = ((lobby?.localMember.playerSlots ?? []) as PlayerSlot[])[1 - slot];
    // Escolheu a 1ª e a 2ª ainda está vazia: já pergunta a 2ª.
    this.view = slot === 0 && !other?.championId ? { kind: 'slotlane', slot: 1 } : { kind: 'auto' };
  }

  /** Nome digitado no chat: vale para o que estiver aberto (slot, banimento, escolha, banco do ARAM). */
  private async typedChampion(credentials: LcuCredentials, typed: string): Promise<void> {
    const champion = await this.findChampion(typed);
    if (!champion) {
      this.note = `Não achei o campeão "${typed}".`;
      return;
    }
    const session = this.state?.champSelect;
    if (this.view.kind === 'slotchamp') await this.chooseSlot(credentials, this.view.slot, this.view.lane, champion.id);
    else if (session?.banActionId != null) await banChampion(credentials, champion.id);
    else if (session?.pickActionId != null) await pickChampion(credentials, champion.id);
    else if (session?.benchEnabled) await swapWithBench(credentials, champion.id);
    else this.note = 'Nomes de campeão valem na hora de escolher, banir ou trocar no ARAM.';
  }

  private async applyRunes(credentials: LcuCredentials, choice: string): Promise<string> {
    const session = this.state?.champSelect;
    const championId = session?.championId || this.lastChampionId;
    if (!session || championId <= 0) throw new Error('Escolha um campeão primeiro.');
    const champion = await this.champion(championId);
    let page: RunePageSuggestion | null = null;
    let spells: number[] = [];

    if (choice === 'rec') {
      [page] = await getRecommendedRunePages(credentials, championId, session.assignedPosition || 'none', session.benchEnabled ? 12 : 11);
      spells = page?.summonerSpellIds ?? [];
    } else {
      const key = (await this.championStats(championId, (session.assignedPosition || '').toUpperCase()))?.runes?.[Number(choice)]?.key;
      if (key) {
        const [primary, sub, ids] = key.split('|');
        const perks = ids.split(',').map((id) => ({ id: Number(id), name: '', styleId: 0 }));
        page = { recommendationId: `stats:${key}`, keystone: perks[0], primaryStyleId: Number(primary), secondaryStyleId: Number(sub), perks, summonerSpellIds: [] };
      }
    }
    if (!page) throw new Error('Não encontrei runas para esse campeão.');
    const result = await applyRunePage(credentials, page, champion?.name ?? 'Campeão');
    if (spells.length === 2) await applySummonerSpells(credentials, spells).catch(() => undefined);
    return `Runas aplicadas na página "${result.pageName}"${spells.length === 2 ? ' + feitiços' : ''}.`;
  }

  // ---- Vínculo com o bot (tela de Configurações) ----

  private registerIpc(): void {
    ipcMain.handle('telegram:status', () => ({ connected: !!this.device }));

    ipcMain.handle('telegram:connect', async () => {
      if (this.linking) this.linking.cancelled = true;
      const linking = { cancelled: false };
      this.linking = linking;
      const { code, url } = await this.api<{ code: string; url: string }>('POST', '/v1/notify/link', undefined, false);
      await shell.openExternal(url);

      const deadline = Date.now() + LINK_TIMEOUT_MS;
      while (!linking.cancelled && Date.now() < deadline) {
        await sleep(2_000);
        const status = await this.api<{ linked: boolean; device?: string }>('GET', `/v1/notify/link/${code}`, undefined, false);
        if (status.linked && status.device) {
          this.settings.setTelegramDevice(status.device);
          this.linking = null;
          this.note = 'Rift Companion conectado! Este painel acompanha o seu LoL e se atualiza sozinho.';
          this.lastPanel = '';
          await this.render(true);
          return { connected: true };
        }
      }
      this.linking = null;
      return { connected: false };
    });

    ipcMain.handle('telegram:cancel', () => {
      if (this.linking) this.linking.cancelled = true;
    });

    ipcMain.handle('telegram:test', async () => {
      this.note = 'Teste do Rift Companion: tudo funcionando.';
      this.pendingNotify = true;
      await this.render(true);
    });

    ipcMain.handle('telegram:disconnect', async () => {
      await this.api('POST', '/v1/notify/unlink').catch(() => undefined);
      this.settings.setTelegramDevice(null);
    });
  }

  // ---- Dados ----

  /** Campeões com mais maestria, primeiro os que são jogados na rota pedida. */
  private async suggestedChampions(position: string): Promise<number[]> {
    const mastery = (await this.lcu<Array<{ championId: number; championPoints: number }>>(
      '/lol-champion-mastery/v1/local-player/champion-mastery',
    )) ?? [];
    const byMastery = [...mastery].sort((a, b) => b.championPoints - a.championPoints).map((m) => m.championId);
    if (!LANES.includes(position as (typeof LANES)[number])) return byMastery;
    const inLane = new Set((await this.allTierList()).filter((t) => t.position === position).map((t) => t.championId));
    return [...byMastery.filter((id) => inLane.has(id)), ...byMastery.filter((id) => !inLane.has(id))];
  }

  private async championButtons(ids: number[], action: (id: number) => string): Promise<Button[]> {
    const buttons: Button[] = [];
    for (const id of ids) {
      const champion = await this.champion(id);
      if (champion) buttons.push({ text: champion.name, action: action(id) });
    }
    return buttons;
  }

  private async findChampion(typed: string): Promise<ChampionSummary | null> {
    await this.champion(1);
    const query = normalize(typed);
    const all = [...this.champions.values()];
    return (
      all.find((c) => normalize(c.name) === query || normalize(c.alias) === query) ??
      all.find((c) => normalize(c.name).startsWith(query)) ??
      null
    );
  }

  private async queue(credentials: LcuCredentials, id: number): Promise<QueueOption | null> {
    if (!this.queues.has(id)) this.queues = new Map((await getQueues(credentials).catch(() => [])).map((q) => [q.id, q]));
    return this.queues.get(id) ?? null;
  }

  private async allTierList(): Promise<TierEntry[]> {
    if (Date.now() - this.tierListAt > 30 * 60_000) {
      this.tierList = (await this.api<TierEntry[]>('GET', '/v1/stats/tierlist', undefined, false).catch(() => [])) ?? [];
      this.tierListAt = Date.now();
    }
    return this.tierList;
  }

  private async championStats(championId: number, position: string): Promise<ChampionStats | null> {
    const key = `${championId}:${position}`;
    if (this.statsCache.has(key)) return this.statsCache.get(key)!;
    const query = position ? `?position=${encodeURIComponent(position)}` : '';
    const stats = await this.api<ChampionStats>('GET', `/v1/stats/champion/${championId}${query}`, undefined, false).catch(() => null);
    this.statsCache.set(key, stats);
    return stats;
  }

  private async champion(id: number): Promise<ChampionSummary | null> {
    if (this.champions.size === 0) {
      const list = await this.lcu<ChampionSummary[]>('/lol-game-data/assets/v1/champion-summary.json');
      for (const c of list ?? []) if (c.id > 0) this.champions.set(c.id, c);
    }
    return this.champions.get(id) ?? null;
  }

  private async spellName(id: number): Promise<string> {
    if (this.spellNames.size === 0) {
      const list = await this.lcu<Array<{ id: number; name: string }>>('/lol-game-data/assets/v1/summoner-spells.json');
      for (const s of list ?? []) this.spellNames.set(s.id, s.name);
    }
    return this.spellNames.get(id) ?? String(id);
  }

  private async perkName(id: number): Promise<string | null> {
    if (this.perkNames.size === 0) {
      const list = await this.lcu<Array<{ id: number; name: string }>>('/lol-perks/v1/perks');
      for (const p of list ?? []) this.perkNames.set(p.id, p.name);
    }
    return this.perkNames.get(id) ?? null;
  }

  // ---- Auxiliares ----

  private async api<T>(method: 'GET' | 'POST', path: string, body?: unknown, withDevice = true, timeoutMs = 15_000): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withDevice) {
      if (!this.device) throw new Error('Telegram não conectado.');
      headers['X-Rift-Device'] = this.device;
    }
    const response = await fetch(RIFT_API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    // O servidor esqueceu o aparelho (desvinculado ou bot bloqueado): desconecta aqui também.
    if ((response.status === 401 || response.status === 410) && withDevice) this.settings.setTelegramDevice(null);
    if (!response.ok) throw new Error(json?.error ?? `Erro ${response.status} do servidor.`);
    return json as T;
  }

  private async lcu<T>(endpoint: string): Promise<T | null> {
    const credentials = this.connector.getCredentials();
    if (!credentials) return null;
    return lcuRequest<T>(credentials, 'GET', endpoint).catch(() => null);
  }
}

/** Arte de carregamento do campeão no Data Dragon (o alias do cliente é o id do Data Dragon). */
function championArt(champion: ChampionSummary): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${encodeURIComponent(champion.alias)}_0.jpg`;
}

function rows(buttons: Button[], perRow: number): Button[][] {
  const result: Button[][] = [];
  for (let i = 0; i < buttons.length; i += perRow) result.push(buttons.slice(i, i + perRow));
  return result.slice(0, 9);
}

function backButton(): Button {
  return { text: 'Voltar', action: 'back' };
}

function laneName(lane: string): string {
  return LANE_NAMES[lane] ?? lane;
}

function queueRank(queueId: number): number {
  const index = QUEUE_ORDER.indexOf(queueId);
  return index === -1 ? QUEUE_ORDER.length : index;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Sem acentos, espaços e pontuação: "Kai'Sa" e "kaisa" batem. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
