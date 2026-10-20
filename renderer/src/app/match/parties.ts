import type { MatchSummary } from '../history/riot.types';

/** Cores das bolinhas de grupo (duo, trio...), uma por grupo. */
export const PARTY_COLORS = ['#ffb35c', '#6f8cff', '#3ecf8e', '#c77dff', '#ff6fae'];
export const PARTY_NAMES: Record<number, string> = { 2: 'Duo', 3: 'Trio', 4: 'Grupo de 4', 5: 'Grupo de 5' };

export interface PartyInfo {
  color: string;
  label: string;
  /** true = visto na partida ao vivo (sala ou servidor); false = estimado pelo histórico. */
  confirmed: boolean;
}

const STORAGE_KEY = 'rift.parties.v1';
/** Partidas guardadas; as mais antigas saem primeiro. */
const MAX_STORED = 300;

type Stored = Record<string, { at: number; groups: string[][] }>;

function read(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    return value && typeof value === 'object' ? (value as Stored) : {};
  } catch {
    return {};
  }
}

/**
 * Guarda os grupos vistos na partida ao vivo, por matchId do match-v5
 * ("BR1_123"), em Riot IDs minúsculos. A Riot não informa grupos depois da partida.
 */
export function rememberParties(matchId: string, groups: string[][]): void {
  const valid = groups.filter((group) => group.length > 1);
  if (!matchId || !valid.length) return;
  const stored = read();
  stored[matchId] = { at: Date.now(), groups: valid };
  const entries = Object.entries(stored).sort(([, a], [, b]) => b.at - a.at).slice(0, MAX_STORED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Sem espaço: os grupos só deixam de aparecer no histórico.
  }
}

/**
 * Grupos de uma partida terminada. Usa o que foi visto ao vivo; sem isso, estima
 * por quem esteve no mesmo time em outra partida da lista (`context`).
 */
export function partiesOf(match: MatchSummary, context: MatchSummary[] = []): Map<string, PartyInfo> {
  const stored = read()[match.matchId]?.groups;
  const confirmed = !!stored;
  const groups = stored ?? inferGroups(match, context);
  const result = new Map<string, PartyInfo>();
  groups.forEach((group, index) => {
    const info = {
      color: PARTY_COLORS[index % PARTY_COLORS.length],
      label: PARTY_NAMES[group.length] ?? `Grupo de ${group.length}`,
      confirmed,
    };
    for (const id of group) result.set(id.toLowerCase(), info);
  });
  return result;
}

/** Jogadores do mesmo time que também estiveram juntos (mesmo time) em outra partida da lista. */
function inferGroups(match: MatchSummary, context: MatchSummary[]): string[][] {
  const others = context.filter((m) => m.matchId !== match.matchId);
  if (!others.length) return [];
  const teammates = (m: MatchSummary) => {
    const teams = new Map<string, number>();
    for (const p of m.participants) if (p.riotId) teams.set(p.riotId.toLowerCase(), p.teamId);
    return teams;
  };
  const otherTeams = others.map(teammates);
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    return up === id ? id : find(up);
  };

  for (const teamId of [100, 200]) {
    const ids = match.participants.filter((p) => p.teamId === teamId && p.riotId).map((p) => p.riotId.toLowerCase());
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const together = otherTeams.some((teams) => teams.has(ids[i]) && teams.get(ids[i]) === teams.get(ids[j]));
        if (together) parent.set(find(ids[j]), find(ids[i]));
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    groups.set(root, [...new Set([...(groups.get(root) ?? [root]), id])]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
