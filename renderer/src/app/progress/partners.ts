import type { MatchParticipant, MatchSummary } from '../history/riot.types';
import type { PartyInfo } from '../match/parties';

/** Arena tem times de 2 que não são "grupo" (o jogo junta sozinho). */
const ARENA_MAP = 30;
/** Mínimo de partidas juntos para o parceiro aparecer. */
const MIN_TOGETHER = 2;
/** Mínimo de partidas com o campeão para entrar nos seus melhores. */
const MIN_CHAMPION_GAMES = 3;

export interface WinRecord {
  games: number;
  wins: number;
}

export interface Partner extends WinRecord {
  riotId: string;
  /** Campeões que essa pessoa mais jogou com você (até 3). */
  champions: number[];
}

export interface ChampionRecord extends WinRecord {
  championId: number;
}

export interface PartnerStats {
  solo: WinRecord;
  grouped: WinRecord;
  partners: Partner[];
  champions: ChampionRecord[];
}

/**
 * "Com quem você ganha mais": suas partidas sozinho x em grupo, cada parceiro de duo (ou
 * trio) com as vitórias juntos e seus campeões que mais ganham. `partiesOf` diz os grupos
 * de cada partida (o que foi visto ao vivo ou estimado pelo histórico).
 */
export function partnerStats(
  rows: Array<{ match: MatchSummary; me: MatchParticipant }>,
  partiesOf: (match: MatchSummary) => Map<string, PartyInfo>,
): PartnerStats {
  const solo: WinRecord = { games: 0, wins: 0 };
  const grouped: WinRecord = { games: 0, wins: 0 };
  const partners = new Map<string, { riotId: string; games: number; wins: number; champions: Map<number, number> }>();
  const champions = new Map<number, WinRecord>();

  for (const { match, me } of rows) {
    if (match.mapId === ARENA_MAP || match.gameDurationSeconds < 300) continue;
    const champion = champions.get(me.championId) ?? { games: 0, wins: 0 };
    champion.games++;
    if (me.win) champion.wins++;
    champions.set(me.championId, champion);

    const parties = partiesOf(match);
    const mine = me.riotId ? parties.get(me.riotId.toLowerCase()) : undefined;
    const mates = mine
      ? match.participants.filter((p) => p.puuid !== me.puuid && p.teamId === me.teamId && p.riotId && parties.get(p.riotId.toLowerCase()) === mine)
      : [];
    const bucket = mates.length ? grouped : solo;
    bucket.games++;
    if (me.win) bucket.wins++;
    for (const mate of mates) {
      const key = mate.riotId.toLowerCase();
      const line = partners.get(key) ?? { riotId: mate.riotId, games: 0, wins: 0, champions: new Map() };
      line.games++;
      if (me.win) line.wins++;
      line.champions.set(mate.championId, (line.champions.get(mate.championId) ?? 0) + 1);
      partners.set(key, line);
    }
  }

  return {
    solo,
    grouped,
    partners: [...partners.values()]
      .filter((p) => p.games >= MIN_TOGETHER)
      .map((p) => ({
        riotId: p.riotId,
        games: p.games,
        wins: p.wins,
        champions: [...p.champions].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
      }))
      .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
      .slice(0, 6),
    champions: [...champions]
      // "Que mais ganham": só com pelo menos metade de vitórias (43% não é "ganhar mais").
      .filter(([, r]) => r.games >= MIN_CHAMPION_GAMES && r.wins / r.games >= 0.5)
      .map(([championId, r]) => ({ championId, ...r }))
      // Vitórias suavizadas: 3 de 3 não passa na frente de 9 de 12.
      .sort((a, b) => (b.wins + 2) / (b.games + 4) - (a.wins + 2) / (a.games + 4))
      .slice(0, 3),
  };
}
