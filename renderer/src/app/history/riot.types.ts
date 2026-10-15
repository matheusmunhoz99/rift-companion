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
}

export interface RiotSettings {
  platformId: string;
  platforms: Array<{ id: string; label: string }>;
}

export interface RiotBridge {
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
