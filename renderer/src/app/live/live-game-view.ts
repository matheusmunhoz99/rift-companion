import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveGame, LiveParticipant, LocalGame, MatchSummary } from '../history/riot.types';
import { NavigationService } from '../core/navigation.service';
import { LcuService } from '../lcu/lcu.service';
import { TIER_NAMES, mainRank, queueName, rankText, tierName as tierLabelOf, winRate } from '../riot/labels';
import type { RankedEntry } from '../history/riot.types';
import { findEncounters, type PlayerEncounters } from './encounters';
import type { PlayerTag } from './live-dashboard';
import { estimateWinChance } from './win-chance';
import { ChampionStatsPanel } from '../stats/champion-stats';
import { allPositionsTierList, assignTeamPositions, positionOrder } from '../stats/match-context';
import { statsPositionLabel, type TierEntry } from '../stats/stats.types';
import { MatchDetails } from '../match/match-details';
import { PARTY_COLORS, PARTY_NAMES, rememberParties } from '../match/parties';
import { LiveDashboardPanel } from './live-dashboard';
import { LiveDataService } from './live-data.service';
import { ChampionDamageService } from '../stats/champion-damage.service';
import { RiftUsersService } from '../core/rift-users.service';
import { RiftUserBadge } from '../ui/rift-user-badge';

interface CardTag {
  label: string;
  tone: 'party' | 'accent' | 'good' | 'warn' | 'bad' | 'muted';
  color?: string;
}

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
 * A Riot só libera a partida no spectator 2 a 3 minutos depois do início.
 * Enquanto isso a tela usa os dados locais do jogo e tenta de novo a cada 15 s.
 */
const RETRY_MS = 15_000;
/** No começo (sem nada na tela ainda), tenta de novo bem mais rápido. */
const FIRST_RETRY_MS = 4_000;

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
  imports: [ChampionStatsPanel, MatchDetails, LiveDashboardPanel, RiftUserBadge],
  templateUrl: './live-game-view.html',
  styleUrl: './live-game-view.scss',
})
export class LiveGameView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly nav = inject(NavigationService);

  protected readonly liveData = inject(LiveDataService);
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

  protected readonly me = computed(() => {
    const game = this.game();
    const summoner = this.lcu.state().summoner;
    if (!game || !summoner) return null;
    const riotId = `${summoner.gameName}#${summoner.tagLine}`.toLowerCase();
    return game.participants.find((p) => p.riotId.toLowerCase() === riotId) ?? null;
  });

  protected readonly allyTeamId = computed(() => this.me()?.teamId ?? 100);

  /** Distribuição de rotas por campeão (coleta), usada quando o jogo não informa a rota. */
  private readonly tierList = signal<TierEntry[]>([]);
  /**
   * Rotas informadas pelo jogo (chave "id:<riot id>") ou pela seleção (chave
   * "<time>:<campeão>"). Nunca só pelo campeão: a Partida Rápida repete campeões entre os times.
   */
  private readonly knownPositions = signal<Map<string, string>>(new Map());

  /** Rota de cada jogador em Summoner's Rift (vazio em outros mapas). */
  protected readonly positions = computed(() => {
    const game = this.game();
    const result = new Map<LiveParticipant, string>();
    if (!game || game.mapId !== SUMMONERS_RIFT) return result;
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

  /** Grupos deduzidos pelo histórico no servidor (puuids). */
  private readonly premades = signal<string[][]>([]);
  private premadesFor = 0;

  /**
   * Grupo de cada jogador (por Riot ID): os do histórico mais o seu grupo da sala,
   * que o app sabe com certeza. Cada grupo ganha uma cor.
   */
  private readonly partyGroups = computed(() => {
    const game = this.game();
    if (!game) return [];
    const byPuuid = new Map(
      game.participants.filter((p) => p.puuid).map((p) => [p.puuid, p.riotId.toLowerCase()]),
    );
    const inGame = new Set(game.participants.map((p) => p.riotId.toLowerCase()));
    const groups: string[][] = this.premades().map((g) =>
      g.map((puuid) => byPuuid.get(puuid)).filter((id): id is string => !!id),
    );
    const party = this.lcu.party().filter((id) => inGame.has(id));
    if (party.length > 1) groups.push(party);

    // Junta grupos que se sobrepõem (ex.: o histórico achou parte do seu grupo).
    const merged: Array<Set<string>> = [];
    for (const group of groups) {
      const touching = merged.filter((m) => group.some((id) => m.has(id)));
      const union = new Set([...group, ...touching.flatMap((m) => [...m])]);
      for (const m of touching) merged.splice(merged.indexOf(m), 1);
      if (union.size > 1) merged.push(union);
    }
    return merged;
  });

  protected readonly parties = computed(() => {
    const result = new Map<string, { color: string; label: string }>();
    this.partyGroups().forEach((group, index) => {
      const info = {
        color: PARTY_COLORS[index % PARTY_COLORS.length],
        label: PARTY_NAMES[group.size] ?? `Grupo de ${group.size}`,
      };
      for (const id of group) result.set(id, info);
    });
    return result;
  });

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
  protected readonly elapsed = computed(() => {
    const start = this.game()?.gameStartTime ?? 0;
    if (start <= 0) return null;
    const seconds = Math.max(0, Math.floor((this.now() - start) / 1000));
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
      clearInterval(clock);
    });
    void allPositionsTierList().then((list) => this.tierList.set(list));

    // A Riot não informa grupos depois da partida: guarda os vistos aqui para o histórico.
    effect(() => {
      const game = this.game();
      const groups = this.partyGroups();
      const platformId = untracked(() => this.lcu.state().platformId) ?? 'BR1';
      if (game && game.gameId > 0 && groups.length)
        rememberParties(
          `${platformId}_${game.gameId}`,
          groups.map((g) => [...g]),
        );
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
      const game = await window.riot.getLiveGame(summoner.gameName, summoner.tagLine, platformId);
      this.game.set(game);
      this.waitingRiot.set(false);
      this.failures = 0;
      // A Riot API não informa rotas; o jogo local às vezes sim.
      void window.riot.getLocalGame().then(
        (local) => local && this.rememberPositions(local),
        () => undefined,
      );
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
    const local = await window.riot!.getLocalGame().catch(() => null);

    if (local && local.players.length > 0) {
      this.rememberPositions(local);
      const game = this.fromLocal(local);
      if (!this.game() || this.waitingRiot()) this.game.set(game);
      this.waitingRiot.set(true);
      this.error.set(null);
      this.failures = 0;
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
      this.retryTimer = setTimeout(() => void this.load(), this.game() ? RETRY_MS : FIRST_RETRY_MS);
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
    const party = this.partyOf(player);
    if (party) tags.push({ label: party.label, tone: 'party', color: party.color });
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
    return { tags: tags.slice(0, 2), more: Math.max(0, tags.length - 2) };
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

  /** Grupos pelo histórico (uma vez por partida; o servidor guarda o resultado). */
  private async loadPremades(
    game: LiveGame,
    gameName: string,
    tagLine: string,
    platformId: string,
  ): Promise<void> {
    if (!window.riot || this.premadesFor === game.gameId) return;
    this.premadesFor = game.gameId;
    try {
      this.premades.set((await window.riot.getPremades(gameName, tagLine, platformId)).groups);
    } catch {
      this.premadesFor = 0;
    }
  }

  /** Monta a partida com os dados locais do jogo (sem elo, maestria nem puuid). */
  private fromLocal(local: LocalGame): LiveGame {
    return {
      gameId: 0,
      queueId: local.queueId,
      mapId: 11,
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
    if (known.size) this.knownPositions.set(known);
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
    this.premades.set([]);
    this.premadesFor = 0;
    this.knownPositions.set(new Map());
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
