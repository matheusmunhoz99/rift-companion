import { PlanPanel } from './plan-panel';
import { ScreenLayout } from '../core/screen-layout';
import { LayoutMenu } from '../ui/layout-menu';
import { Icon } from '../ui/icon';
import { diag, errorText } from '../core/diag';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { ClientTeams, LiveGame, LiveParticipant, LivePlayerProfile, LocalGame, MatchSummary, PlanPlayer, PlanRequest, PlanResponse, PremadeGroup } from '../history/riot.types';
import { NavigationService } from '../core/navigation.service';
import { LcuService } from '../lcu/lcu.service';
import { TIER_NAMES, mainRank, queueName, rankText, tierName as tierLabelOf, winRate } from '../riot/labels';
import { ARAM_QUEUES, modeOf } from '../riot/modes';
import type { RankedEntry } from '../history/riot.types';
import { findEncounters, type PlayerEncounters } from './encounters';
import type { PlayerTag } from './live-dashboard';
import { estimateWinChance } from './win-chance';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { allPositionsTierList, assignTeamPositions, positionOrder } from '../stats/match-context';
import { statsPositionLabel, type TierEntry } from '../stats/stats.types';
import { MatchDetails } from '../match/match-details';
import { PARTY_COLORS, PARTY_NAMES, rememberParties } from '../match/parties';
import { clientParties } from '../match/client-groups';
import { rememberGroups, rememberedGroups } from '../match/group-memory';
import { LiveDashboardPanel } from './live-dashboard';
import { AugmentCardsPanel } from './augment-cards-panel';
import { LiveDataService } from './live-data.service';
import { ChampionDamageService } from '../stats/champion-damage.service';
import { RiftUsersService } from '../core/rift-users.service';
import { RiftUserBadge } from '../ui/rift-user-badge';
import { smurfHint } from './smurf';

interface CardTag {
  label: string;
  tone: 'party' | 'accent' | 'good' | 'warn' | 'bad' | 'muted';
  color?: string;
  /** Explicação ao passar o mouse. */
  title?: string;
}

/** Nome curto do grupo no selo do card. */
const PARTY_SHORT: Record<number, string> = { 2: 'Duo', 3: 'Trio', 4: 'Grupo de 4', 5: 'Time fechado' };

interface PartyBadge {
  color: string;
  text: string;
  confidence: string | null;
  level: 'certo' | 'provavel' | 'possivel';
  title: string;
}

interface TeamParty {
  color: string;
  text: string;
  confidence: string | null;
  names: string[];
}

/**
 * De onde veio o grupo, do mais certo ao menos: o cliente do LoL (teamParticipantId), a sua
 * sala, a memória deste PC (já entraram juntos antes), o servidor (memória dele ou histórico).
 */
type PartySource = 'cliente' | 'sala' | 'memoria' | 'historico';
const SOURCE_RANK: Record<PartySource, number> = { cliente: 4, sala: 3, memoria: 2, historico: 1 };

interface PartyGroup {
  ids: Set<string>;
  confidence: number;
  source: PartySource;
  /** Memória: partidas em que já entraram juntos. */
  times: number;
}

/** Nome das rotas em português, para o perfil do jogador. */
const ROLE_NAMES: Record<string, string> = {
  top: 'Topo',
  jungle: 'Selva',
  middle: 'Meio',
  bottom: 'Atirador',
  utility: 'Suporte',
};

/** Siglas de elo como no cliente em português (Prata P, Platina PL...). */
const TIER_SHORT: Record<string, string> = {
  IRON: 'F', BRONZE: 'B', SILVER: 'P', GOLD: 'O', PLATINUM: 'PL', EMERALD: 'E',
  DIAMOND: 'D', MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'DS',
};

/** Summoner's Rift: o único mapa com as cinco rotas. */
const SUMMONERS_RIFT = 11;
const LANE_SHORT: Record<string, string> = {
  TOP: 'TOP',
  JUNGLE: 'JG',
  MIDDLE: 'MID',
  BOTTOM: 'ADC',
  UTILITY: 'SUP',
};

const RECENT_GAMES = 10;
/** Quantas partidas suas são cruzadas com os jogadores da partida atual. */
const ENCOUNTER_GAMES = 20;
/**
 * A Riot libera a partida no spectator de alguns segundos a 2-3 minutos depois do início.
 * Enquanto isso a tela usa os dados locais do jogo e tenta de novo: a cada 6 s nos
 * primeiros ~2 min (no diagnóstico ela saiu ~25 s após o início; com 15 s a tela atrasava),
 * depois a cada 15 s.
 */
const RETRY_MS = 15_000;
const WAITING_RETRY_MS = 6_000;
const WAITING_FAST_ATTEMPTS = 20;
/** No começo (sem nada na tela ainda), tenta de novo bem mais rápido. */
const FIRST_RETRY_MS = 4_000;
/** Grupos (Duo/Trio): nova tentativa a cada 20 s, por até ~4 min da partida. */
const PREMADE_RETRY_MS = 20_000;
const PREMADE_MAX_ATTEMPTS = 12;

interface RecentSummary {
  games: number;
  wins: number;
  winRate: number;
  kda: string;
  /** Partidas recentes com o campeão desta partida. */
  championGames: number;
  championWins: number;
  results: boolean[];
  /** Cada partida recente do jogador, da mais nova para a mais antiga. */
  recentGames: Array<{ match: MatchSummary; championId: number; win: boolean; kda: string }>;
}

/** Resumo de uma pessoa em "Já jogaram com você". */
interface EncounterSummary {
  player: PlayerEncounters;
  /** Campeão da pessoa nesta partida (0 quando ainda não dá para saber). */
  currentChampionId: number;
  together: number;
  togetherWins: number;
  against: number;
  againstWins: number;
  /** Campeões que a pessoa usou nessas partidas (sem repetir). */
  champions: number[];
}

@Component({
  selector: 'app-live-game-view',
  imports: [ChampionStatsPanel, MatchDetails, LiveDashboardPanel, AugmentCardsPanel, RiftUserBadge, Icon, PlanPanel, LayoutMenu],
  templateUrl: './live-game-view.html',
  styleUrl: './live-game-view.scss',
})
export class LiveGameView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly nav = inject(NavigationService);

  protected readonly liveData = inject(LiveDataService);

  /**
   * Ordem das seções da aba Jogadores, escolhida por quem usa (botão "Organizar"). Padrão:
   * os times primeiro (composição, elo, Duo/Trio), o plano da IA e os encontros abaixo.
   */
  protected readonly layout = new ScreenLayout('rift.layout.live.v1', [
    { id: 'times', label: 'Times', description: 'Os 10 jogadores: elo, maestria e Duo/Trio' },
    { id: 'plano', label: 'Plano de jogo', description: 'Análise da IA e opções de build' },
    { id: 'encontros', label: 'Já jogaram com você', description: 'Quem você já encontrou nas últimas partidas' },
  ]);

  protected hiddenLabels(): string {
    return this.layout.hiddenItems().map((item) => item.label).join(', ');
  }

  protected showAll(): void {
    for (const item of this.layout.hiddenItems()) this.layout.setVisible(item.id, true);
  }
  /** Aba: jogadores (elo, histórico) ou dados ao vivo do jogo (timers, objetivos). */
  // A aba inicial pelo hash (#...&tab=live) é usada na revisão visual.
  protected readonly tab = signal<'players' | 'live' | 'build'>(
    location.hash.includes('tab=live')
      ? 'live'
      : location.hash.includes('tab=build')
        ? 'build'
        : 'players',
  );

  protected readonly game = signal<LiveGame | null>(null);
  protected readonly riftUsers = inject(RiftUsersService);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly recent = signal<Record<string, RecentSummary | 'loading' | 'error'>>({});
  /** A partida veio dos dados locais do jogo; elo e maestria ainda não chegaram da Riot. */
  protected readonly waitingRiot = signal(false);

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tentativas seguidas sem conseguir montar a partida (para só mostrar erro se insistir). */
  private failures = 0;
  /** Tentativas esperando a Riot liberar a partida (com os dados locais na tela). */
  private waitingAttempts = 0;
  /** O servidor do app não respondeu (fora do ar, sem internet): não é a Riot atrasando. */
  protected readonly serverIssue = signal(false);

  protected readonly me = computed(() => {
    const game = this.game();
    const summoner = this.lcu.state().summoner;
    if (!game || !summoner) return null;
    const riotId = `${summoner.gameName}#${summoner.tagLine}`.toLowerCase();
    return game.participants.find((p) => p.riotId.toLowerCase() === riotId) ?? null;
  });

  protected readonly allyTeamId = computed(() => this.me()?.teamId ?? 100);

  /** Modo de jogo (ARAM, URF, Arena...): decide rotas, etiquetas de função e estatísticas. */
  protected readonly mode = computed(() => {
    const game = this.game();
    return game ? modeOf(game.queueId, game.mapId) : null;
  });

  /** Distribuição de rotas por campeão (coleta), usada quando o jogo não informa a rota. */
  private readonly tierList = signal<TierEntry[]>([]);
  /**
   * Rotas informadas pelo jogo (chave "id:<riot id>") ou pela seleção (chave
   * "<time>:<campeão>"). Nunca só pelo campeão: a Partida Rápida repete campeões entre os times.
   */
  private readonly rememberedPositions = signal<Map<string, string>>(new Map());

  /**
   * Rotas conhecidas: as lidas no início (jogo + seleção) e as que o jogo informa a cada
   * segundo na aba Ao vivo. No carregamento o jogo às vezes ainda não sabe as rotas e a
   * tela adivinhava pelo campeão (ex.: Zed e Sylas trocados); assim que o jogo informa,
   * a rota real substitui a estimativa.
   */
  private readonly knownPositions = computed(() => {
    const known = new Map(this.rememberedPositions());
    for (const player of this.liveData.data()?.players ?? []) {
      if (player.riotId && player.position) known.set(`id:${player.riotId.toLowerCase()}`, player.position);
    }
    return known;
  });

  /** Rota de cada jogador em Summoner's Rift (vazio em outros mapas). */
  protected readonly positions = computed(() => {
    const game = this.game();
    const result = new Map<LiveParticipant, string>();
    if (!game || game.mapId !== SUMMONERS_RIFT || this.mode()?.lanes === false) return result;
    const known = this.knownPositions();
    for (const teamId of new Set(game.participants.map((p) => p.teamId))) {
      const team = game.participants.filter((p) => p.teamId === teamId);
      const lanes = assignTeamPositions(
        team.map((p) => ({
          championId: p.championId,
          summonerSpellIds: p.summonerSpellIds,
          known:
            known.get(`id:${p.riotId.toLowerCase()}`) ??
            known.get(`${p.teamId}:${p.championId}`) ??
            null,
        })),
        this.tierList(),
      );
      lanes?.forEach((lane, i) => result.set(team[i], lane));
    }
    return result;
  });

  /** Ordem Topo, Selva, Meio, Atirador, Suporte quando as rotas são conhecidas ou estimadas. */
  private byPosition(team: LiveParticipant[]): LiveParticipant[] {
    const positions = this.positions();
    return [...team].sort(
      (a, b) => positionOrder(positions.get(a)) - positionOrder(positions.get(b)),
    );
  }

  /** Sigla da rota para a etiqueta à esquerda do campeão (só em Summoner's Rift). */
  protected laneShort(participant: LiveParticipant): string | null {
    const position = this.positions().get(participant);
    return position ? (LANE_SHORT[position] ?? null) : null;
  }

  protected recentMatches(summary: RecentSummary): MatchSummary[] {
    return summary.recentGames.map((g) => g.match);
  }

  protected positionLabel(participant: LiveParticipant): string | null {
    const position = this.positions().get(participant);
    return position ? statsPositionLabel(position) : null;
  }

  protected readonly allies = computed(() =>
    this.byPosition(
      (this.game()?.participants ?? []).filter((p) => p.teamId === this.allyTeamId()),
    ),
  );

  protected readonly enemies = computed(() =>
    this.byPosition(
      (this.game()?.participants ?? []).filter((p) => p.teamId !== this.allyTeamId()),
    ),
  );

  /** Campeões inimigos, comparados por conteúdo para não recarregar a build a cada atualização. */
  protected readonly enemyIds = computed(() => this.enemies().map((p) => p.championId), {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });

  protected readonly allyIds = computed(() => this.allies().map((p) => p.championId), {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });

  /** Grupos (com confiança) deduzidos pelo histórico no servidor. */
  private readonly premades = signal<PremadeGroup[]>([]);
  /** Perfil de cada jogador (rota, pool, autofill), por puuid. */
  private readonly profiles = signal<Record<string, LivePlayerProfile>>({});
  private premadesFor = 0;
  /** Nova tentativa dos grupos quando a análise falha ou vem incompleta (limite da Riot, servidor ocupado). */
  private premadeRetry: ReturnType<typeof setTimeout> | null = null;
  private premadeAttempts = 0;

  /** Plano de jogo da tela de carregamento (IA + opções de build Mestre+), uma vez por partida. */
  protected readonly plan = signal<PlanResponse | null>(null);
  protected readonly planLoading = signal(false);
  private planFor = 0;

  /** Times da partida como o cliente do LoL conhece (grupo de cada um, autofill). */
  private readonly clientTeams = signal<ClientTeams | null>(null);
  private clientTeamsLogged = 0;

  /** Grupos, times resolvidos e autofill que o cliente do LoL informa para esta partida. */
  private readonly clientInfo = computed(() => {
    const game = this.game();
    return game ? clientParties(this.clientTeams(), game.participants, game.gameId) : null;
  });

  /** Grupos que a memória deste PC reconhece, por time (lida uma vez por partida carregada). */
  private readonly memoryGroups = computed(() => {
    const game = this.game();
    if (!game) return [];
    return [100, 200].flatMap((teamId) =>
      rememberedGroups(game.participants.filter((p) => p.teamId === teamId).map((p) => p.riotId)),
    );
  });

  /**
   * Grupo de cada jogador (por Riot ID). Do mais certo ao menos: cliente do LoL, sua sala,
   * memória deste PC, servidor. Num time que o cliente resolveu inteiro, só vale o cliente:
   * quem não está em grupo é solo com certeza, e nenhuma estimativa contradiz. Cada grupo
   * ganha uma cor.
   */
  private readonly partyGroups = computed(() => {
    const game = this.game();
    if (!game) return [];
    const byPuuid = new Map(
      game.participants.filter((p) => p.puuid).map((p) => [p.puuid, p.riotId.toLowerCase()]),
    );
    const teamOf = new Map(game.participants.map((p) => [p.riotId.toLowerCase(), p.teamId]));
    const client = this.clientInfo();
    const covered = client?.covered ?? new Set<number>();
    const open = (ids: string[]) => ids.length > 1 && ids.every((id) => teamOf.has(id) && !covered.has(teamOf.get(id)!));

    const groups: Array<Omit<PartyGroup, 'ids'> & { ids: string[] }> = [];
    for (const ids of client?.groups ?? []) groups.push({ ids, confidence: 100, source: 'cliente', times: 0 });
    // Sua sala: só quem está no seu time (a sala guardada pode ser de horas atrás).
    const myTeam = this.me()?.teamId;
    const party = this.lcu.party().filter((id) => myTeam && teamOf.get(id) === myTeam);
    if (open(party)) groups.push({ ids: party, confidence: 100, source: 'sala', times: 0 });
    for (const memory of this.memoryGroups()) {
      if (open(memory.ids)) groups.push({ ids: memory.ids, confidence: memory.times >= 3 ? 98 : 96, source: 'memoria', times: memory.times });
    }
    for (const g of this.premades()) {
      const ids = g.puuids.map((puuid) => byPuuid.get(puuid)).filter((id): id is string => !!id);
      const source: PartySource = g.source === 'cliente' ? 'cliente' : g.source === 'memoria' ? 'memoria' : 'historico';
      if (source === 'cliente' ? ids.length > 1 : open(ids)) groups.push({ ids, confidence: g.confidence, source, times: 0 });
    }

    // Junta grupos que se sobrepõem (ex.: o histórico achou parte do seu grupo); fica a fonte mais certa.
    const merged: PartyGroup[] = [];
    for (const group of groups) {
      const touching = merged.filter((m) => group.ids.some((id) => m.ids.has(id)));
      const all = [group, ...touching];
      const best = all.reduce((a, b) =>
        b.confidence > a.confidence || (b.confidence === a.confidence && SOURCE_RANK[b.source] > SOURCE_RANK[a.source]) ? b : a,
      );
      const ids = new Set([...group.ids, ...touching.flatMap((m) => [...m.ids])]);
      for (const m of touching) merged.splice(merged.indexOf(m), 1);
      if (ids.size > 1)
        merged.push({ ids, confidence: best.confidence, source: best.source, times: Math.max(...all.map((g) => g.times)) });
    }
    return merged;
  });

  protected readonly parties = computed(() => {
    const result = new Map<string, { color: string; label: string; confidence: number; source: PartySource; times: number }>();
    this.partyGroups().forEach((group, index) => {
      const info = {
        color: PARTY_COLORS[index % PARTY_COLORS.length],
        label: PARTY_NAMES[group.ids.size] ?? `Grupo de ${group.ids.size}`,
        confidence: group.confidence,
        source: group.source,
        times: group.times,
      };
      for (const id of group.ids) result.set(id, info);
    });
    return result;
  });

  /**
   * Selo do grupo no topo do card. "certo" = o cliente do LoL ou a sua sala disseram;
   * "provavel" = memória ou histórico com confiança alta (80%+); "possivel" = abaixo disso
   * (fica com borda tracejada).
   */
  protected partyBadge(player: LiveParticipant): PartyBadge | null {
    const party = this.partyOf(player);
    if (!party) return null;
    const size = this.partySize(player);
    const sure = party.confidence >= 100;
    const name = PARTY_SHORT[size] ?? 'Grupo';
    return {
      color: party.color,
      text: PARTY_SHORT[size] ?? `Grupo de ${size}`,
      confidence: partyMark(party),
      level: sure ? 'certo' : party.confidence >= 80 ? 'provavel' : 'possivel',
      title:
        party.source === 'cliente'
          ? `${name}: entraram juntos na fila (informado pelo cliente do LoL).`
          : party.source === 'sala'
            ? 'Seu grupo na sala: certeza.'
            : party.source === 'memoria' && party.times > 0
              ? `${name}: já entraram juntos na fila ${party.times === 1 ? '1 vez' : `${party.times} vezes`} (memória deste PC).`
              : party.source === 'memoria'
                ? `${name}: já entraram juntos em partidas anteriores (${party.confidence}% de confiança).`
                : `${name} pelo histórico: jogaram juntos nas últimas partidas (${party.confidence}% de confiança).`,
    };
  }

  /** Grupos de um time, para o resumo no cabeçalho ("Duo: A + B"). */
  protected teamParties(team: LiveParticipant[]): TeamParty[] {
    return this.partyGroups()
      .map((group, index) => {
        const members = team.filter((p) => group.ids.has(p.riotId.toLowerCase()));
        return {
          color: PARTY_COLORS[index % PARTY_COLORS.length],
          text: PARTY_SHORT[group.ids.size] ?? `Grupo de ${group.ids.size}`,
          confidence: partyMark(group),
          names: members.map((p) => this.name(p.riotId).gameName),
        };
      })
      .filter((party) => party.names.length > 1);
  }

  private partySize(player: LiveParticipant): number {
    const id = player.riotId.toLowerCase();
    return this.partyGroups().find((group) => group.ids.has(id))?.ids.size ?? 2;
  }

  /** Perfil (rota, pool, autofill) de um jogador, ou null sem dado. */
  protected profileOf(participant: LiveParticipant): LivePlayerProfile | null {
    const profile = participant.puuid ? this.profiles()[participant.puuid] : null;
    return profile && profile.games > 0 ? profile : null;
  }

  /** Grupo e encontros de cada jogador, para a aba Ao vivo (por Riot ID em minúsculas). */
  protected readonly playerTags = computed(() => {
    const tags = new Map<string, PlayerTag>();
    for (const [riotId, party] of this.parties()) tags.set(riotId, { party, met: null });
    for (const player of this.encounterList()) {
      const riotId = player.riotId.toLowerCase();
      const together = player.encounters.filter((e) => e.sameTeam).length;
      tags.set(riotId, { party: tags.get(riotId)?.party ?? null, met: { together, against: player.encounters.length - together } });
    }
    return tags;
  });

  protected partyOf(participant: LiveParticipant) {
    return this.parties().get(participant.riotId.toLowerCase()) ?? null;
  }

  /** Jogadores desta partida que estavam nas suas últimas 10 partidas. */
  protected readonly encounters = signal<PlayerEncounters[] | 'loading' | null>(null);
  /** Por Riot ID, que existe tanto nos dados locais quanto nos da Riot. */
  protected readonly encounterByRiotId = computed(() => {
    const list = this.encounters();
    return new Map(Array.isArray(list) ? list.map((p) => [p.riotId.toLowerCase(), p]) : []);
  });
  protected readonly encounterList = computed(() => {
    const list = this.encounters();
    return Array.isArray(list) ? list : [];
  });

  /** Suas últimas partidas (as mesmas cruzadas em "Já jogaram com você"). */
  private readonly myMatches = signal<MatchSummary[]>([]);
  protected readonly myMatchList = this.myMatches.asReadonly();
  protected readonly myPuuid = signal<string | null>(null);
  /** Pessoa aberta em "Já jogaram com você" e partida aberta dentro dela. */
  protected readonly openEncounter = signal<string | null>(null);
  protected readonly openMatchId = signal<string | null>(null);

  protected readonly encounterSummaries = computed<EncounterSummary[]>(() => {
    const current = new Map(
      (this.game()?.participants ?? []).map((p) => [p.riotId.toLowerCase(), p.championId]),
    );
    return this.encounterList().map((player) => {
      const together = player.encounters.filter((e) => e.sameTeam);
      const against = player.encounters.filter((e) => !e.sameTeam);
      return {
        player,
        currentChampionId: current.get(player.riotId.toLowerCase()) ?? 0,
        together: together.length,
        togetherWins: together.filter((e) => e.youWon).length,
        against: against.length,
        againstWins: against.filter((e) => e.youWon).length,
        champions: [...new Set(player.encounters.map((e) => e.them.championId))],
      };
    });
  });

  protected toggleEncounter(riotId: string): void {
    this.openEncounter.update((current) => (current === riotId ? null : riotId));
    this.openMatchId.set(null);
  }

  protected toggleMatch(matchId: string): void {
    this.openMatchId.update((current) => (current === matchId ? null : matchId));
  }

  protected matchById(matchId: string): MatchSummary | null {
    return this.myMatches().find((m) => m.matchId === matchId) ?? null;
  }

  /** Relógio da partida (atualiza a cada segundo enquanto a tela está aberta). */
  private readonly now = signal(Date.now());
  /** Segundos desde o início da partida (null sem horário de início). */
  protected readonly elapsedSeconds = computed(() => {
    const start = this.game()?.gameStartTime ?? 0;
    return start > 0 ? Math.max(0, Math.floor((this.now() - start) / 1000)) : null;
  });

  protected readonly elapsed = computed(() => {
    const seconds = this.elapsedSeconds();
    if (seconds === null) return null;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  /** Partida mais recente aberta na lista de um jogador do time (por puuid). */
  protected readonly openRecent = signal<{ puuid: string; matchId: string } | null>(null);

  protected toggleRecent(puuid: string, matchId: string): void {
    this.openRecent.update((current) =>
      current?.puuid === puuid && current.matchId === matchId ? null : { puuid, matchId },
    );
  }

  protected recentMatch(participant: LiveParticipant): MatchSummary | null {
    const open = this.openRecent();
    if (!open || open.puuid !== participant.puuid) return null;
    return (
      this.asSummary(this.recentFor(participant))?.recentGames.find(
        (g) => g.match.matchId === open.matchId,
      )?.match ?? null
    );
  }

  protected readonly winChance = computed(() => {
    const game = this.game();
    return game ? estimateWinChance(game.participants, this.allyTeamId()) : null;
  });

  protected readonly queueName = queueName;
  protected readonly rankText = rankText;
  protected readonly mainRank = mainRank;
  protected readonly winRate = winRate;

  /** Mestre, Grão-Mestre e Desafiante ganham um brilho a mais na borda, como no cliente. */
  protected isApex(tier: string | undefined): boolean {
    return tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER';
  }

  protected tierLabel(player: LiveParticipant): string {
    const rank = mainRank(player.ranked);
    return rank ? rankText(rank) : 'Sem elo';
  }

  /** Selo curto no canto do campeão: "D2", "O4", "M"... */
  protected tierShort(player: LiveParticipant): string | null {
    const rank = mainRank(player.ranked);
    if (!rank) return null;
    const letter = TIER_SHORT[rank.tier] ?? (TIER_NAMES[rank.tier] ?? rank.tier)[0];
    if (this.isApex(rank.tier)) return letter;
    const division = { I: '1', II: '2', III: '3', IV: '4' }[rank.rank] ?? '';
    return `${letter}${division}`;
  }

  constructor() {
    // Quem da partida também usa o Rift Companion (ícone no nick).
    effect(() => this.riftUsers.check(this.game()?.participants.map((p) => p.riotId) ?? []));
    // Carrega ao entrar em partida e limpa ao sair.
    effect(() => {
      const state = this.lcu.state();
      const inGame = state.gameflowPhase === 'InProgress' || state.gameflowPhase === 'Reconnect';
      if (inGame && state.summoner) {
        untracked(() => {
          if (!this.game() && !this.loading()) void this.load();
        });
      } else {
        untracked(() => this.reset());
      }
    });
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      this.clearRetry();
      this.clearPremadeRetry();
      clearInterval(clock);
    });
    void allPositionsTierList().then((list) => this.tierList.set(list));

    // A Riot não informa grupos depois da partida: guarda os vistos aqui para o histórico.
    // Os certos (cliente do LoL, sua sala) também vão para a memória de grupos deste PC.
    effect(() => {
      const game = this.game();
      const groups = this.partyGroups();
      const platformId = untracked(() => this.lcu.state().platformId) ?? 'BR1';
      const gameId = game?.gameId || untracked(() => this.clientTeams()?.gameId) || 0;
      if (!game || !gameId || !groups.length) return;
      if (game.gameId > 0)
        rememberParties(
          `${platformId}_${game.gameId}`,
          groups.map((g) => [...g.ids]),
        );
      const certain = groups.filter((g) => g.source === 'cliente' || g.source === 'sala').map((g) => [...g.ids]);
      if (certain.length) rememberGroups(`${platformId}_${gameId}`, certain);
    });
  }

  async load(): Promise<void> {
    const state = this.lcu.state();
    const summoner = state.summoner;
    if (!summoner || !window.riot) return;

    const platformId = state.platformId ?? 'BR1';
    this.clearRetry();
    this.loading.set(true);
    this.error.set(null);
    try {
      const started = Date.now();
      const game = await window.riot.getLiveGame(summoner.gameName, summoner.tagLine, platformId);
      if (this.game()?.gameId !== game.gameId) {
        diag('partida', {
          gameId: game.gameId,
          ms: Date.now() - started,
          detail: {
            fila: game.queueId,
            jogadores: game.participants.length,
            ocultos: game.participants.filter((p) => !p.puuid).length,
          },
        });
      }
      this.game.set(game);
      this.waitingRiot.set(false);
      this.waitingAttempts = 0;
      this.failures = 0;
      this.serverIssue.set(false);
      // A Riot API não informa rotas; o jogo local às vezes sim.
      void window.riot.getLocalGame().then(
        (local) => local && this.rememberPositions(local),
        () => undefined,
      );
      void this.loadClientTeams(game);
      void this.loadEncounters(game, platformId);
      void this.loadPremades(game, summoner.gameName, summoner.tagLine, platformId);
    } catch (error) {
      await this.showFromLocalOrRetry(platformId, error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * A Riot ainda não publicou a partida no spectator (normal nos primeiros minutos),
   * ou o servidor hesitou. Monta os times pelos dados do próprio jogo quando dá e
   * tenta sozinho até a partida aparecer — nunca deixa a tela num erro que exige clicar.
   */
  private async showFromLocalOrRetry(platformId: string, error: unknown): Promise<void> {
    const inGame = ['InProgress', 'Reconnect'].includes(this.lcu.state().gameflowPhase ?? '');
    // No começo da partida a Riot ainda não liberou os dados: é normal, não é falha.
    const notYet = inGame && /não está em partida/i.test(errorText(error));
    this.serverIssue.set(inGame && !notYet);
    diag(notYet ? 'aguardando-riot' : 'falha', {
      detail: { onde: 'partida-ao-vivo', erro: errorText(error), tentativas: this.waitingAttempts, fase: this.lcu.state().gameflowPhase },
    });
    const local = await window.riot!.getLocalGame().catch(() => null);

    if (local && local.players.length > 0) {
      this.rememberPositions(local);
      const game = this.fromLocal(local);
      if (!this.game() || this.waitingRiot()) this.game.set(game);
      this.waitingRiot.set(true);
      this.error.set(null);
      this.failures = 0;
      void this.loadClientTeams(game);
      void this.loadEncounters(game, platformId);
    } else if (!this.game()) {
      // Sem nada ainda: mensagem calma nas primeiras tentativas; o erro real só se insistir.
      this.failures++;
      this.error.set(
        this.failures <= 3
          ? 'Carregando a partida… os times aparecem em instantes.'
          : cleanError(error),
      );
    }

    // Enquanto estamos em partida e ainda falta a versão da Riot, tenta de novo sozinho.
    if (inGame && (!this.game() || this.waitingRiot())) {
      const delay = !this.game()
        ? FIRST_RETRY_MS
        : this.waitingAttempts++ < WAITING_FAST_ATTEMPTS
          ? WAITING_RETRY_MS
          : RETRY_MS;
      this.retryTimer = setTimeout(() => void this.load(), delay);
    }
  }

  protected async toggle(participant: LiveParticipant): Promise<void> {
    const puuid = participant.puuid;
    if (!puuid) return;
    this.expanded.update((current) => (current === puuid ? null : puuid));
    if (this.expanded() !== puuid || this.recent()[puuid]) return;

    this.setRecent(puuid, 'loading');
    try {
      const platformId = this.lcu.state().platformId ?? 'BR1';
      const matches = await window.riot!.getMatches(puuid, platformId, 0, RECENT_GAMES);
      this.setRecent(puuid, summarize(matches, participant));
    } catch {
      this.setRecent(puuid, 'error');
    }
  }

  protected openPlayer(participant: { riotId: string }): void {
    if (participant.riotId) this.nav.openPlayer(participant.riotId, this.lcu.state().platformId);
  }

  protected recentFor(participant: LiveParticipant) {
    return this.recent()[participant.puuid] ?? null;
  }

  protected asSummary(value: RecentSummary | 'loading' | 'error' | null): RecentSummary | null {
    return typeof value === 'object' ? value : null;
  }

  protected startTime(timestamp: number): string {
    return timestamp > 0
      ? new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '—';
  }

  protected iconUrl(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  /** Fundo do card: arte do campeão (CSS url pronto para --splash). */
  protected splashStyle(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? `url("${this.ddragon.championLoadingUrl(champion)}")` : null;
  }

  protected readonly damage = inject(ChampionDamageService);

  protected teamDamage(team: LiveParticipant[]) {
    return this.damage.team(team.map((player) => player.championId));
  }

  protected pct(value: number): number {
    return Math.round(value * 100);
  }

  /** "Ouro II", "Mestre": divisão só abaixo do Mestre. */
  protected tierName(rank: RankedEntry): string {
    return this.isApex(rank.tier) ? tierLabelOf(rank.tier) : `${tierLabelOf(rank.tier)} ${rank.rank}`;
  }

  /** As duas filas ranqueadas mostradas no card, cada uma com o seu elo. */
  protected readonly rankQueues = [
    { type: 'RANKED_SOLO_5x5', short: 'Solo', label: 'Solo/Duo' },
    { type: 'RANKED_FLEX_SR', short: 'Flex', label: 'Flex' },
  ] as const;

  protected queueRank(player: LiveParticipant, queueType: string): RankedEntry | null {
    return player.ranked.find((entry) => entry.queueType === queueType) ?? null;
  }

  /** Partidas ranqueadas na fila do elo principal. */
  protected rankGames(player: LiveParticipant): number {
    const rank = mainRank(player.ranked);
    return rank ? rank.wins + rank.losses : 0;
  }

  protected rankWinRate(player: LiveParticipant): number | null {
    const rank = mainRank(player.ranked);
    return rank ? winRate(rank.wins, rank.losses) : null;
  }

  /**
   * Etiquetas curtas do card: o que vale saber do jogador de relance. Máximo 3; o
   * resto vira "+N".
   */
  protected cardTags(player: LiveParticipant): { tags: CardTag[]; more: number } {
    const tags: CardTag[] = [];
    // Jogador escondido pelo modo streamer: a Riot não devolve identidade. Honesto, sem chutar.
    // Sem puuid nos dados locais do jogo é normal (a Riot ainda não liberou): não é modo streamer.
    if (!player.puuid && !this.waitingRiot()) return { tags: [{ label: 'Oculto (modo streamer)', tone: 'muted' }], more: 0 };
    // O grupo (duo, trio...) tem selo próprio no topo do card: não entra nas etiquetas.
    const profile = this.profileOf(player);
    // Conta de nível baixo com elo alto: vem primeiro, é o que mais muda a leitura do jogador.
    const smurf = smurfHint(player.summonerLevel, player.ranked);
    if (smurf) tags.push({ label: 'Provável smurf', tone: 'bad', title: smurf });
    // O cliente do LoL sabe com certeza quem caiu fora da rota; o histórico só estima.
    // "Autofill" e "Main <rota>" só em fila com função (no ARAM, URF, Arena... não existem).
    const roles = this.mode()?.roles ?? true;
    const autofill = this.clientInfo()?.autofill.get(player.riotId.toLowerCase()) ?? profile?.autofill;
    if (roles && autofill === true) tags.push({ label: 'Autofill', tone: 'warn' });
    if (profile?.oneTrick) {
      const top = this.ddragon.champion(profile.topChampions[0]?.championId ?? 0)?.name;
      tags.push({ label: top ? `OTP ${top}` : 'One-trick', tone: 'good' });
    } else if (roles && profile?.mainRole && profile.roleShare >= 0.65 && ROLE_NAMES[profile.mainRole.toLowerCase()]) {
      tags.push({ label: `Main ${ROLE_NAMES[profile.mainRole.toLowerCase()]}`, tone: 'accent' });
    }
    const met = this.encounterOf(player);
    if (met) tags.push({ label: `Já jogou ${met.encounters.length}x`, tone: 'accent' });
    const points = player.mastery?.points ?? 0;
    const champion = this.ddragon.champion(player.championId)?.name;
    if (points >= 100_000) tags.push({ label: champion ? `Main ${champion}` : 'Main', tone: 'good' });
    else if (player.mastery && points < 5_000) tags.push({ label: 'Pouca experiência', tone: 'warn' });
    else if (!player.mastery && !this.waitingRiot()) tags.push({ label: 'Primeira vez', tone: 'warn' });
    const rate = this.rankWinRate(player);
    const games = this.rankGames(player);
    if (rate !== null && games >= 20 && rate >= 57) tags.push({ label: 'Em alta', tone: 'good' });
    if (rate !== null && games >= 20 && rate <= 44) tags.push({ label: 'Em baixa', tone: 'bad' });
    if (games > 0 && games < 15) tags.push({ label: 'Poucas ranqueadas', tone: 'muted' });
    return { tags: tags.slice(0, 3), more: Math.max(0, tags.length - 3) };
  }

  protected name(riotId: string): { gameName: string; tag: string } {
    const [gameName, tag] = riotId.split('#');
    return { gameName: gameName || 'Jogador oculto', tag: tag ?? '' };
  }

  protected encounterOf(participant: LiveParticipant): PlayerEncounters | null {
    return this.encounterByRiotId().get(participant.riotId.toLowerCase()) ?? null;
  }

  protected kda(p: { kills: number; deaths: number; assists: number }): string {
    return `${p.kills}/${p.deaths}/${p.assists}`;
  }

  protected timeAgo(timestamp: number): string {
    const minutes = Math.round((Date.now() - timestamp) / 60_000);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  }

  /** Busca suas últimas 10 partidas e cruza com os jogadores desta. */
  private async loadEncounters(game: LiveGame, platformId: string): Promise<void> {
    const summoner = this.lcu.state().summoner;
    const riotId = summoner ? `${summoner.gameName}#${summoner.tagLine}`.toLowerCase() : null;
    const me = game.participants.find((p) => p.riotId.toLowerCase() === riotId);
    // Uma vez por partida: com os dados locais ou com os da Riot, o que vier primeiro.
    if (!me || !summoner || !window.riot || this.encounters() !== null) return;
    this.encounters.set('loading');
    try {
      // Nos dados locais não há puuid: o seu vem pelo Riot ID.
      const myPuuid =
        me.puuid ||
        (await window.riot.findPlayer(summoner.gameName, summoner.tagLine, platformId)).puuid;
      const matches = await window.riot.getMatches(myPuuid, platformId, 0, ENCOUNTER_GAMES);
      this.myMatches.set(matches);
      this.myPuuid.set(myPuuid);
      this.encounters.set(
        findEncounters(myPuuid, me.riotId, me.teamId, game.participants, matches),
      );
    } catch {
      this.encounters.set(null);
    }
  }

  /**
   * Grupos direto do cliente do LoL (teamParticipantId): certeza, nos dois times, sem gastar
   * a cota da Riot. Busca de novo enquanto não vier (o cliente preenche os times no início).
   */
  private async loadClientTeams(game: LiveGame): Promise<void> {
    if (!window.riot?.getClientTeams) return;
    const current = this.clientTeams();
    if (current?.players.some((p) => p.partyId) && (!game.gameId || current.gameId === game.gameId)) return;
    const teams = await window.riot.getClientTeams().catch(() => null);
    const now = this.game();
    // Partida trocou enquanto esperava: descarta.
    if (!teams || !now || (now.gameId > 0 && teams.gameId > 0 && now.gameId !== teams.gameId)) return;
    this.clientTeams.set(teams);
    if (this.clientTeamsLogged === teams.gameId) return;
    this.clientTeamsLogged = teams.gameId;
    const info = this.clientInfo();
    diag('grupos-cliente', {
      gameId: teams.gameId || game.gameId,
      detail: {
        jogadores: teams.players.length,
        comGrupo: teams.players.filter((p) => p.partyId).length,
        timesCobertos: [...(info?.covered ?? [])],
        grupos: (info?.groups ?? []).map((ids) => ids.length),
        autofill: teams.players.filter((p) => p.autofill).length,
      },
    });
  }

  /**
   * Grupos pelo histórico (o servidor guarda o resultado). Se a análise falhar ou vier
   * incompleta, tenta de novo a cada 20 s enquanto for a mesma partida: antes, uma falha
   * deixava a partida inteira sem Duo/Trio, sem aviso.
   */
  private async loadPremades(
    game: LiveGame,
    gameName: string,
    tagLine: string,
    platformId: string,
  ): Promise<void> {
    if (!window.riot || this.premadesFor === game.gameId) return;
    this.premadesFor = game.gameId;
    this.clearPremadeRetry();
    let complete = false;
    const attempt = this.premadeAttempts + 1;
    const started = Date.now();
    try {
      const analysis = await window.riot.getPremades(gameName, tagLine, platformId);
      if (this.game()?.gameId !== game.gameId) return;
      const names = new Map(game.participants.map((p) => [p.puuid, p.riotId]));
      diag('grupos', {
        gameId: game.gameId,
        ms: Date.now() - started,
        detail: {
          tentativa: attempt,
          completo: analysis.complete ?? null,
          grupos: (analysis.premades ?? []).map((g) => ({
            confianca: g.confidence,
            jogadores: g.puuids.map((puuid) => names.get(puuid) ?? '?'),
          })),
          perfis: Object.keys(analysis.profiles ?? {}).length,
        },
      });
      // Clientes contra um servidor antigo recebem só `groups`; aí derivo os grupos sem confiança.
      const premades =
        analysis.premades ?? analysis.groups.map((puuids) => ({ puuids, size: puuids.length, confidence: 60 }));
      // Resposta parcial não apaga o que uma tentativa anterior já achou.
      if (premades.length || analysis.complete !== false) this.premades.set(premades);
      const profiles = analysis.profiles ?? {};
      if (Object.keys(profiles).length || analysis.complete !== false) this.profiles.set(profiles);
      complete = analysis.complete !== false;
    } catch (error) {
      complete = false;
      diag('falha', { gameId: game.gameId, ms: Date.now() - started, detail: { onde: 'grupos', tentativa: attempt, erro: errorText(error) } });
    }
    // Plano de jogo depois da 1ª análise de grupos: a IA já sabe quem é Duo/Trio e "Main X".
    void this.loadPlan(game, platformId);
    if (complete) {
      this.premadeAttempts = 0;
      return;
    }
    if (this.game()?.gameId !== game.gameId || ++this.premadeAttempts > PREMADE_MAX_ATTEMPTS) return;
    this.premadeRetry = setTimeout(() => {
      this.premadeRetry = null;
      if (this.game()?.gameId !== game.gameId) return;
      this.premadesFor = 0;
      void this.loadPremades(game, gameName, tagLine, platformId);
    }, PREMADE_RETRY_MS);
  }

  /** Pede o plano de jogo uma vez por partida; sem resposta, o painel some (é um extra). */
  private async loadPlan(game: LiveGame, platformId: string): Promise<void> {
    const me = this.me();
    if (!window.riot?.getPlan || !me || this.planFor === game.gameId) return;
    this.planFor = game.gameId;
    this.planLoading.set(true);
    const started = Date.now();
    try {
      const result = await window.riot.getPlan(this.planRequest(game, platformId, me));
      if (this.game()?.gameId !== game.gameId) return;
      this.plan.set(result);
      diag('plano', {
        gameId: game.gameId,
        ms: Date.now() - started,
        detail: { ia: !!result?.plan, build: !!result?.build, pontos: result?.plan?.pontos.length ?? 0 },
      });
    } catch (error) {
      diag('falha', { gameId: game.gameId, detail: { onde: 'plano', erro: errorText(error) } });
    } finally {
      if (this.game()?.gameId === game.gameId) this.planLoading.set(false);
    }
  }

  private planRequest(game: LiveGame, platformId: string, me: LiveParticipant): PlanRequest {
    const toPlayer = (p: LiveParticipant): PlanPlayer => {
      const rank = mainRank(p.ranked);
      const party = this.partyBadge(p);
      return {
        champion: this.ddragon.champion(p.championId)?.name ?? '',
        championId: p.championId,
        position: this.positions().get(p) ?? null,
        rank: rank ? this.tierName(rank) : null,
        winRate: this.rankWinRate(p),
        games: this.rankGames(p),
        masteryK: p.mastery ? Math.round(p.mastery.points / 1000) : null,
        tags: this.cardTags(p).tags.map((tag) => tag.label),
        party: party ? `${party.text} ${party.confidence ?? '(certeza)'}` : null,
        me: p === me,
      };
    };
    const damage = this.teamDamage(this.enemies());
    const enemyDamage = damage ? (damage.ap >= 0.5 ? 'ap' : damage.ap <= 0.3 ? 'ad' : 'mixed') : null;
    return {
      gameId: game.gameId,
      platformId,
      queueId: game.queueId,
      mapId: game.mapId,
      enemyDamage,
      allies: this.allies().map(toPlayer),
      enemies: this.enemies().map(toPlayer),
    };
  }

  private clearPremadeRetry(): void {
    if (this.premadeRetry) clearTimeout(this.premadeRetry);
    this.premadeRetry = null;
  }

  /** Monta a partida com os dados locais do jogo (sem elo, maestria nem puuid). */
  private fromLocal(local: LocalGame): LiveGame {
    return {
      gameId: 0,
      queueId: local.queueId,
      mapId: local.mapId || (ARAM_QUEUES.has(local.queueId) ? 12 : SUMMONERS_RIFT),
      gameStartTime: local.gameStartTime,
      participants: local.players.map((p) => ({
        puuid: '',
        riotId: p.riotId,
        championId: this.ddragon.championKeyOf(p.championKey),
        teamId: p.team === 'CHAOS' ? 200 : 100,
        // O Golpear evoluído tem nomes próprios no jogo; todos contam como Golpear (11).
        summonerSpellIds: p.spellKeys.map(
          (key) => this.ddragon.spellIdOf(key) || (/smite/i.test(key) ? 11 : 0),
        ),
        keystoneId: p.keystoneId,
        subStyleId: p.subStyleId,
        ranked: [],
        mastery: null,
      })),
    };
  }

  /** Guarda as rotas que o jogo (todos os jogadores) e a seleção (às vezes parcial) informaram. */
  private rememberPositions(local: LocalGame): void {
    const known = new Map<string, string>();
    for (const { teamId, championId, position } of local.championPositions ?? [])
      known.set(`${teamId}:${championId}`, position);
    for (const player of local.players) {
      if (player.riotId && player.position)
        known.set(`id:${player.riotId.toLowerCase()}`, player.position);
    }
    if (known.size) this.rememberedPositions.set(known);
  }

  private setRecent(puuid: string, value: RecentSummary | 'loading' | 'error'): void {
    this.recent.update((current) => ({ ...current, [puuid]: value }));
  }

  private reset(): void {
    this.clearRetry();
    this.game.set(null);
    this.error.set(null);
    this.expanded.set(null);
    this.recent.set({});
    this.encounters.set(null);
    this.myMatches.set([]);
    this.myPuuid.set(null);
    this.openEncounter.set(null);
    this.openMatchId.set(null);
    this.openRecent.set(null);
    this.waitingRiot.set(false);
    this.waitingAttempts = 0;
    this.premades.set([]);
    this.profiles.set({});
    this.clientTeams.set(null);
    this.clientTeamsLogged = 0;
    this.premadesFor = 0;
    this.clearPremadeRetry();
    this.premadeAttempts = 0;
    this.plan.set(null);
    this.planLoading.set(false);
    this.planFor = 0;
    this.rememberedPositions.set(new Map());
    this.failures = 0;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

function summarize(matches: MatchSummary[], participant: LiveParticipant): RecentSummary {
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let championGames = 0;
  let championWins = 0;
  const results: boolean[] = [];
  const recentGames: RecentSummary['recentGames'] = [];

  for (const match of matches) {
    const p = match.participants.find((x) => x.puuid === participant.puuid);
    if (!p) continue;
    results.push(p.win);
    recentGames.push({
      match,
      championId: p.championId,
      win: p.win,
      kda: `${p.kills}/${p.deaths}/${p.assists}`,
    });
    if (p.win) wins++;
    kills += p.kills;
    deaths += p.deaths;
    assists += p.assists;
    if (p.championId === participant.championId) {
      championGames++;
      if (p.win) championWins++;
    }
  }

  const games = results.length;
  return {
    games,
    wins,
    winRate: games ? Math.round((wins / games) * 100) : 0,
    kda: deaths === 0 ? 'Perfeito' : ((kills + assists) / deaths).toFixed(2),
    championGames,
    championWins,
    results,
    recentGames,
  };
}

function cleanError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}

/** Marca ao lado do selo: nada quando é certeza, "3x" da memória, "%" da estimativa. */
function partyMark(group: { confidence: number; source: PartySource; times: number }): string | null {
  if (group.confidence >= 100) return null;
  if (group.source === 'memoria' && group.times > 0) return `${group.times}x`;
  return `${group.confidence}%`;
}
