import https from 'node:https';
import { lanePosition } from './lanes';
import {
  DEFAULT_TIMINGS,
  toLiveDashboard,
  type LivePlayer,
  type LiveTeam,
  type ObjectiveKey,
  type ObjectiveTimings,
  type RawDashboardData,
} from './live-dashboard';

/**
 * Live Client Data API: exposta pelo próprio jogo em https://127.0.0.1:2999
 * durante a partida. Só traz informação que o jogador já vê no jogo.
 */
// RIFT_LIVE_CLIENT_URL: só para testes com um jogo falso.
const LIVE_CLIENT_URL = process.env.RIFT_LIVE_CLIENT_URL ?? 'https://127.0.0.1:2999/liveclientdata/allgamedata';

// Certificado autoassinado da Riot; só fala com localhost.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export interface OverlayPlayer {
  championName: string;
  /** Nome interno no Data Dragon (ex.: "MonkeyKing"). */
  championKey: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  /** Itens por slot (0-6); o renderer soma o preço no Data Dragon. */
  items: Array<{ id: number; count: number }>;
}

export interface OverlayData {
  gameTime: number;
  gameMode: string;
  me: (OverlayPlayer & {
    position: string;
    csPerMinute: number;
    gold: number;
    wardScore: number;
    /** Níveis de Q, W, E e R; null quando o jogo não informa. */
    skills: [number, number, number, number] | null;
  }) | null;
  /** Inimigo da mesma rota; null sem rotas (ARAM, por exemplo). */
  opponent: OverlayPlayer | null;
  /** Abates de campeões por time (aliado x inimigo). */
  teamKills: { ally: number; enemy: number };
  objectives: {
    dragons: { ally: number; enemy: number };
    barons: { ally: number; enemy: number };
    heralds: { ally: number; enemy: number };
    towers: { ally: number; enemy: number };
  };
  /** Objetivos do Summoner's Rift ainda em jogo, com o tempo de surgimento (mesmos timers do painel). */
  upcoming: Array<{ key: ObjectiveKey; name: string; state: 'upcoming' | 'alive'; at: number }>;
}

interface RawPlayer {
  riotId?: string;
  summonerName?: string;
  championName: string;
  rawChampionName?: string;
  team: string;
  /** TOP, JUNGLE, MIDDLE, BOTTOM ou UTILITY; vazio quando o modo não atribui rotas. */
  position?: string;
  summonerSpells?: Record<'summonerSpellOne' | 'summonerSpellTwo', { rawDisplayName?: string } | undefined>;
  runes?: { keystone?: { id: number }; secondaryRuneTree?: { id: number } };
  level: number;
  scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number };
}

export interface RawGameData {
  activePlayer?: { riotId?: string; summonerName?: string; currentGold?: number; level?: number };
  allPlayers: RawPlayer[];
  events?: { Events: Array<{ EventName: string; KillerName?: string; EventTime: number; DragonType?: string }> };
  gameData: { gameTime: number; gameMode: string };
}

export function fetchRawGameData(): Promise<RawGameData | null> {
  return new Promise((resolve) => {
    const request = https.get(LIVE_CLIENT_URL, { agent: localAgent, timeout: 1500 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RawGameData);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

/** Jogador da partida pelos dados locais do jogo, sem elo nem maestria. */
export interface LocalPlayer {
  riotId: string;
  /** Nome interno do campeão no Data Dragon (ex.: "MonkeyKing"). */
  championKey: string;
  team: 'ORDER' | 'CHAOS';
  /** Nomes internos dos feitiços (ex.: "SummonerFlash"). */
  spellKeys: string[];
  keystoneId: number;
  subStyleId: number;
  /** Rota informada pelo jogo, ou vazio. */
  position: string;
}

/**
 * Os dois times direto do jogo, disponíveis assim que a partida carrega
 * (a Riot API só libera a partida no spectator alguns minutos depois).
 */
export function toLocalPlayers(raw: RawGameData): LocalPlayer[] {
  return raw.allPlayers.map((p) => ({
    riotId: p.riotId ?? p.summonerName ?? '',
    championKey: (p.rawChampionName ?? '').replace('game_character_displayname_', '') || p.championName,
    team: p.team === 'CHAOS' ? 'CHAOS' : 'ORDER',
    spellKeys: (['summonerSpellOne', 'summonerSpellTwo'] as const).map(
      (slot) => p.summonerSpells?.[slot]?.rawDisplayName?.match(/SummonerSpell_(\w+?)_DisplayName/)?.[1] ?? '',
    ),
    keystoneId: p.runes?.keystone?.id ?? 0,
    subStyleId: p.runes?.secondaryRuneTree?.id ?? 0,
    position: lanePosition(p.position),
  }));
}

/** Barra sobre o jogo: você, o inimigo da sua rota, o placar e os próximos objetivos. */
export function toOverlayData(raw: RawGameData, timings: ObjectiveTimings = DEFAULT_TIMINGS): OverlayData {
  const live = toLiveDashboard(raw as RawDashboardData, timings);
  const mine = live.players.find((p) => p.isMe) ?? null;
  const opponent = mine?.position ? (live.players.find((p) => !p.ally && p.position === mine.position) ?? null) : null;
  const player = (p: LivePlayer): OverlayPlayer => ({
    championName: p.championName,
    championKey: p.championKey,
    level: p.level,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.cs,
    items: p.items,
  });
  const abilities = (raw as RawDashboardData).activePlayer?.abilities;
  const skills = abilities
    ? ((['Q', 'W', 'E', 'R'] as const).map((key) => abilities[key]?.abilityLevel ?? 0) as [number, number, number, number])
    : null;
  const count = (pick: (t: LiveTeam) => number) => ({ ally: pick(live.teams.ally), enemy: pick(live.teams.enemy) });
  const minutes = live.gameTime / 60;

  return {
    gameTime: live.gameTime,
    gameMode: live.gameMode,
    me: mine && {
      ...player(mine),
      position: mine.position,
      csPerMinute: minutes > 0 ? Math.round((mine.cs / minutes) * 10) / 10 : 0,
      gold: live.me?.currentGold ?? 0,
      wardScore: mine.wardScore,
      skills,
    },
    opponent: opponent && player(opponent),
    teamKills: count((t) => t.kills),
    objectives: {
      dragons: count((t) => t.dragons.length),
      barons: count((t) => t.barons),
      heralds: count((t) => t.heralds),
      towers: count((t) => t.towers),
    },
    upcoming: live.objectives
      .filter((o): o is typeof o & { state: 'upcoming' | 'alive' } => o.state !== 'done'),
  };
}
