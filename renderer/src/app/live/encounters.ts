import type { LiveParticipant, MatchParticipant, MatchSummary } from '../history/riot.types';

/** Uma partida recente em que você e outro jogador da partida atual estavam juntos. */
export interface Encounter {
  matchId: string;
  queueId: number;
  gameEndTimestamp: number;
  /** true = estavam no mesmo time; false = jogou contra você. */
  sameTeam: boolean;
  /** Resultado do seu ponto de vista. */
  youWon: boolean;
  you: { championId: number; kills: number; deaths: number; assists: number };
  them: { championId: number; kills: number; deaths: number; assists: number };
}

export interface PlayerEncounters {
  puuid: string;
  riotId: string;
  /** Lado do jogador na partida atual em relação a você. */
  allyNow: boolean;
  encounters: Encounter[];
}

/**
 * Cruza os jogadores da partida atual com as suas partidas recentes.
 * Os puuids do spectator e do match-v5 são os mesmos (criptografados pela mesma chave).
 * Nos dados locais do jogo não há puuid: aí o jogador é reconhecido pelo Riot ID.
 */
export function findEncounters(
  myPuuid: string,
  myRiotId: string,
  myTeamId: number,
  participants: LiveParticipant[],
  myMatches: MatchSummary[],
): PlayerEncounters[] {
  const result: PlayerEncounters[] = [];

  for (const player of participants) {
    const riotId = player.riotId.toLowerCase();
    if (player.puuid === myPuuid || riotId === myRiotId.toLowerCase() || (!player.puuid && !riotId)) continue;
    const encounters: Encounter[] = [];

    for (const match of myMatches) {
      const me = match.participants.find((p) => p.puuid === myPuuid);
      const them = match.participants.find((p) =>
        player.puuid ? p.puuid === player.puuid : p.riotId.toLowerCase() === riotId,
      );
      if (!me || !them) continue;
      encounters.push({
        matchId: match.matchId,
        queueId: match.queueId,
        gameEndTimestamp: match.gameEndTimestamp,
        sameTeam: me.teamId === them.teamId,
        youWon: me.win,
        you: stats(me),
        them: stats(them),
      });
    }

    if (encounters.length > 0) {
      result.push({ puuid: player.puuid, riotId: player.riotId, allyNow: player.teamId === myTeamId, encounters });
    }
  }

  // Quem apareceu mais vezes primeiro.
  return result.sort((a, b) => b.encounters.length - a.encounters.length);
}

function stats(p: MatchParticipant) {
  return { championId: p.championId, kills: p.kills, deaths: p.deaths, assists: p.assists };
}
