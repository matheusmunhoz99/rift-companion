import type { ClientTeams } from '../history/riot.types';

/** O mínimo de um jogador da partida para casar com o que o cliente do LoL informa. */
interface Participant {
  riotId: string;
  teamId: number;
  championId: number;
}

export interface ClientParties {
  /** Grupos de 2+ jogadores, em Riot IDs minúsculos. */
  groups: string[][];
  /**
   * Times em que o cliente informou o grupo de todos: aí quem não está em grupo é solo,
   * com certeza, e nenhuma estimativa (memória, histórico) deve contradizer.
   */
  covered: Set<number>;
  /** Autofill pelo cliente (true/false), por Riot ID minúsculo. */
  autofill: Map<string, boolean>;
}

/**
 * Grupos que o cliente do LoL informa (teamParticipantId igual = entraram juntos na fila).
 * O cliente usa outro puuid, então cada jogador é achado pelo time + campeão. Partida
 * diferente (gameId) ou campeão repetido no time: ignora, sem chute.
 */
export function clientParties(
  teams: ClientTeams | null,
  participants: Participant[],
  gameId: number,
): ClientParties | null {
  if (!teams?.players.length) return null;
  // A partida pelos dados locais (antes da Riot liberar) ainda não tem gameId: aceita.
  if (gameId > 0 && teams.gameId > 0 && teams.gameId !== gameId) return null;

  const byKey = new Map<string, ClientTeams['players'][number] | null>();
  for (const p of teams.players) {
    const key = `${p.teamId}:${p.championId}`;
    byKey.set(key, byKey.has(key) ? null : p); // repetido = ambíguo
  }

  const covered = new Set<number>();
  const groups: string[][] = [];
  const autofill = new Map<string, boolean>();
  for (const teamId of [100, 200]) {
    const team = participants.filter((p) => p.teamId === teamId);
    if (!team.length) continue;
    const parties = new Map<number, string[]>();
    let complete = new Set(team.map((p) => p.championId)).size === team.length;
    for (const player of team) {
      const client = byKey.get(`${teamId}:${player.championId}`);
      const id = player.riotId.toLowerCase();
      if (client && client.autofill !== null && id) autofill.set(id, client.autofill);
      if (!client?.partyId) {
        complete = false;
        continue;
      }
      if (id) parties.set(client.partyId, [...(parties.get(client.partyId) ?? []), id]);
    }
    if (complete) covered.add(teamId);
    for (const ids of parties.values()) if (ids.length > 1) groups.push(ids);
  }
  return { groups, covered, autofill };
}
