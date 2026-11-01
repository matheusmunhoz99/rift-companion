import type { LcuCredentials } from '../lcu/credentials';
import { lcuRequest } from '../lcu/http';
import { lanePosition } from '../overlay/lanes';

/** Jogador escondido (bot, modo streamer) vem com este puuid zerado. */
const EMPTY_PUUID = '00000000-0000-0000-0000-000000000000';

/**
 * Times da partida em andamento como o cliente do LoL conhece (/lol-gameflow/v1/session).
 * `partyId` é o teamParticipantId: igual para quem entrou junto na fila. É o mesmo dado que
 * o cliente usa, então duo/trio/grupo saem com certeza, nos dois times, sem gastar a cota
 * da Riot API.
 */
export interface ClientTeamPlayer {
  puuid: string;
  teamId: 100 | 200;
  championId: number;
  /** null = o cliente não informou o grupo deste jogador. */
  partyId: number | null;
  /** Rota da seleção (TOP, JUNGLE...) ou vazio. */
  position: string;
  /** true = caiu numa rota que não escolheu; null = o cliente não informou. */
  autofill: boolean | null;
}

export interface ClientTeams {
  gameId: number;
  queueId: number;
  players: ClientTeamPlayer[];
}

interface RawSessionPlayer {
  puuid?: string | null;
  championId?: number | null;
  teamParticipantId?: number | string | null;
  selectedPosition?: string | null;
  selectedRole?: string | null;
}

export interface RawGameflowSession {
  gameData?: {
    gameId?: number | null;
    queue?: { id?: number | null } | null;
    teamOne?: RawSessionPlayer[] | null;
    teamTwo?: RawSessionPlayer[] | null;
  } | null;
}

/**
 * "MIDDLE.AUTOFILL.TOP.JUNGLE" = rota atual . motivo . 1ª escolha . 2ª escolha (. fill).
 * O motivo AUTOFILL é o que importa; formato desconhecido -> null (sem dado, sem chute).
 */
function autofillOf(role: string | null | undefined): boolean | null {
  if (!role) return null;
  const segments = role.split('.');
  if (segments.length !== 4 && segments.length !== 5) return null;
  return segments[1].toUpperCase() === 'AUTOFILL';
}

function partyIdOf(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function toClientTeams(session: RawGameflowSession | null): ClientTeams | null {
  const data = session?.gameData;
  if (!data) return null;
  const players = (['teamOne', 'teamTwo'] as const).flatMap((team) =>
    (data[team] ?? []).map(
      (p): ClientTeamPlayer => ({
        puuid: p.puuid && p.puuid !== EMPTY_PUUID ? p.puuid : '',
        teamId: team === 'teamOne' ? 100 : 200,
        championId: Number(p.championId) || 0,
        partyId: partyIdOf(p.teamParticipantId),
        position: lanePosition(p.selectedPosition),
        autofill: autofillOf(p.selectedRole),
      }),
    ),
  );
  if (!players.length) return null;
  return { gameId: Number(data.gameId) || 0, queueId: Number(data.queue?.id) || 0, players };
}

export async function readClientTeams(credentials: LcuCredentials | null): Promise<ClientTeams | null> {
  if (!credentials) return null;
  const session = await lcuRequest<RawGameflowSession>(credentials, 'GET', '/lol-gameflow/v1/session').catch(() => null);
  return toClientTeams(session);
}

/**
 * Parâmetros para o servidor: gameId e "time.campeão.grupo,...". O cliente do LoL usa outro
 * puuid (não o da Riot API), então o servidor acha cada jogador pelo time + campeão, confere
 * com a partida dele e pula a análise dos times que vierem completos. Campeão repetido no
 * mesmo time (modos especiais) fica de fora: não dá para saber quem é quem.
 */
export function clientPartyQuery(teams: ClientTeams | null): string {
  if (!teams?.gameId) return '';
  const count = new Map<string, number>();
  for (const p of teams.players) count.set(`${p.teamId}.${p.championId}`, (count.get(`${p.teamId}.${p.championId}`) ?? 0) + 1);
  const known = teams.players.filter((p) => p.championId > 0 && p.partyId && count.get(`${p.teamId}.${p.championId}`) === 1);
  if (!known.length) return '';
  const client = known.map((p) => `${p.teamId}.${p.championId}.${p.partyId}`).join(',');
  return `?${new URLSearchParams({ gameId: String(teams.gameId), client })}`;
}
