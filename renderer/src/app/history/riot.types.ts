// Espelha electron/riot/players.ts e electron/riot/matches.ts.
export interface RankedEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface PlayerProfile {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformId: string;
  summonerLevel: number;
  profileIconId: number;
  ranked: RankedEntry[];
  topMastery: Array<{ championId: number; level: number; points: number; lastPlayTime: number }>;
}

export interface MatchParticipant {
  puuid: string;
  riotId: string;
  championId: number;
  teamId: number;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  champLevel: number;
  cs: number;
  gold: number;
  damageToChampions: number;
  visionScore: number;
  items: number[];
  summonerSpellIds: number[];
  perks: {
    primaryStyleId: number;
    subStyleId: number;
    selections: number[];
    statPerks: number[];
  };
}

export interface MatchSummary {
  matchId: string;
  queueId: number;
  mapId: number;
  gameVersion: string;
  gameEndTimestamp: number;
  gameDurationSeconds: number;
  participants: MatchParticipant[];
  /** "local": veio do histórico do cliente do LoL (modos que a API da Riot não entrega). */
  source?: "local";
}

export interface RiotSettings {
  platformId: string;
  platforms: Array<{ id: string; label: string }>;
}

// Espelha server/src/riot/live.ts.
export interface LiveParticipant {
  puuid: string;
  riotId: string;
  championId: number;
  teamId: number;
  summonerSpellIds: number[];
  keystoneId: number;
  subStyleId: number;
  ranked: RankedEntry[];
  mastery: { level: number; points: number } | null;
}

export interface LiveGame {
  gameId: number;
  queueId: number;
  mapId: number;
  gameStartTime: number;
  participants: LiveParticipant[];
}

/** Partida pelos dados locais do jogo (sem elo, maestria nem puuid). */
export interface LocalGame {
  queueId: number;
  gameStartTime: number;
  players: Array<{
    riotId: string;
    championKey: string;
    team: 'ORDER' | 'CHAOS';
    spellKeys: string[];
    keystoneId: number;
    subStyleId: number;
    /** Rota informada pelo jogo, ou vazio. */
    position: string;
  }>;
  /** Rotas escolhidas na seleção (pela sessão do cliente), por time e campeão. */
  championPositions: Array<{ teamId: number; championId: number; position: string }>;
}

// Espelha electron/overlay/live-dashboard.ts.
export interface LivePlayer {
  riotId: string;
  championKey: string;
  championName: string;
  ally: boolean;
  isMe: boolean;
  position: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wardScore: number;
  isDead: boolean;
  respawnTimer: number;
  items: Array<{ id: number; count: number }>;
  spellKeys: string[];
  keystoneId: number;
}

export interface LiveTeam {
  kills: number;
  towers: number;
  inhibitors: number;
  dragons: string[];
  barons: number;
  heralds: number;
  grubs: number;
  atakhan: number;
}

export type LiveEventKind =
  | 'kill' | 'first-blood' | 'multikill' | 'ace' | 'dragon' | 'baron' | 'herald' | 'grubs' | 'atakhan' | 'tower' | 'inhibitor';

export interface LiveEvent {
  time: number;
  kind: LiveEventKind;
  ally: boolean | null;
  killer: string;
  victim: string;
  detail: string;
}

export interface LiveDashboard {
  gameTime: number;
  gameMode: string;
  /** 11 = Summoner's Rift, 12 = Abismo Uivante (ARAM); null quando o jogo não informa. */
  mapNumber?: number | null;
  players: LivePlayer[];
  me: {
    riotId: string;
    currentGold: number;
    stats: {
      attackDamage: number;
      abilityPower: number;
      armor: number;
      magicResist: number;
      attackSpeed: number;
      moveSpeed: number;
      critChance: number;
      lifeSteal: number;
      abilityHaste: number;
      currentHealth: number;
      maxHealth: number;
    } | null;
  } | null;
  teams: { ally: LiveTeam; enemy: LiveTeam };
  timers: {
    dragon: { at: number; elder: boolean } | null;
    baron: number | null;
    inhibitors: Array<{ ally: boolean; lane: string; respawnAt: number }>;
  } | null;
  objectives: Array<{
    key: 'dragon' | 'grubs' | 'herald' | 'atakhan' | 'baron';
    name: string;
    state: 'upcoming' | 'alive' | 'done';
    at: number;
  }>;
  events: LiveEvent[];
}

// Espelha electron/lcu/postgame.ts.
export interface PostGamePlayer {
  puuid: string;
  riotId: string;
  championId: number;
  teamId: number;
  win: boolean;
  isMe: boolean;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  damageToChampions: number;
  damageTaken: number;
  damageMitigated: number;
  healing: number;
  gold: number;
  cs: number;
  vision: number;
  wardsPlaced: number;
  wardsKilled: number;
  largestMultiKill: number;
  structureDamage: number;
  items: number[];
  spellIds: number[];
  killShare: number;
  damageShare: number;
  score: number;
  rank: number;
}

export interface PostGame {
  gameId: number;
  queueId: number | null;
  queueType: string;
  gameMode: string;
  durationSeconds: number;
  endedAt: number;
  myTeamWon: boolean | null;
  players: PostGamePlayer[];
}

export interface RiotBridge {
  getLiveGame(gameName: string, tagLine: string, platformId: string): Promise<LiveGame>;
  getLocalGame(): Promise<LocalGame | null>;
  getLiveDashboard(): Promise<LiveDashboard | null>;
  getPostGame(): Promise<PostGame | null>;
  onPostGame(callback: (game: PostGame) => void): () => void;
  /** Grupos (duo, trio...) da partida em andamento, em puuids. */
  getPremades(gameName: string, tagLine: string, platformId: string): Promise<{ groups: string[][] }>;
  getSettings(): Promise<RiotSettings>;
  setPlatform(platformId: string): Promise<void>;
  findPlayer(gameName: string, tagLine: string, platformId: string): Promise<PlayerProfile>;
  getMatches(puuid: string, platformId: string, start: number, count: number): Promise<MatchSummary[]>;
}

declare global {
  interface Window {
    riot?: RiotBridge;
  }
}
