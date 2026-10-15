import https from 'node:https';

/**
 * Live Client Data API: exposta pelo próprio jogo em https://127.0.0.1:2999
 * durante a partida. Só traz informação que o jogador já vê no jogo.
 */
const LIVE_CLIENT_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';

// Certificado autoassinado da Riot; só fala com localhost.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export interface OverlayData {
  gameTime: number;
  gameMode: string;
  me: {
    championName: string;
    level: number;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    csPerMinute: number;
    gold: number;
    wardScore: number;
  } | null;
  /** Abates de campeões por time (aliado x inimigo). */
  teamKills: { ally: number; enemy: number };
  objectives: {
    dragons: { ally: number; enemy: number };
    barons: { ally: number; enemy: number };
    heralds: { ally: number; enemy: number };
    towers: { ally: number; enemy: number };
  };
}

interface RawPlayer {
  riotId?: string;
  summonerName?: string;
  championName: string;
  team: string;
  level: number;
  scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number };
}

interface RawGameData {
  activePlayer?: { riotId?: string; summonerName?: string; currentGold?: number; level?: number };
  allPlayers: RawPlayer[];
  events?: { Events: Array<{ EventName: string; KillerName?: string; EventTime: number }> };
  gameData: { gameTime: number; gameMode: string };
}

export function fetchLiveClientData(): Promise<OverlayData | null> {
  return new Promise((resolve) => {
    const request = https.get(LIVE_CLIENT_URL, { agent: localAgent, timeout: 1500 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          resolve(toOverlayData(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RawGameData));
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

function toOverlayData(raw: RawGameData): OverlayData {
  const myId = raw.activePlayer?.riotId ?? raw.activePlayer?.summonerName ?? '';
  const playerName = (p: RawPlayer) => p.riotId ?? p.summonerName ?? '';
  const me = raw.allPlayers.find((p) => playerName(p) === myId) ?? null;
  const allyTeam = me?.team ?? 'ORDER';

  // Eventos citam o abatedor pelo nome (jogador, ou minion/torre). Jogador desconhecido não conta.
  const teamOf = new Map(raw.allPlayers.map((p) => [playerName(p), p.team]));
  const shortName = new Map(raw.allPlayers.map((p) => [playerName(p).split('#')[0], p.team]));
  const killerTeam = (killer?: string) =>
    killer ? (teamOf.get(killer) ?? shortName.get(killer.split('#')[0]) ?? null) : null;

  const objectives = {
    dragons: { ally: 0, enemy: 0 },
    barons: { ally: 0, enemy: 0 },
    heralds: { ally: 0, enemy: 0 },
    towers: { ally: 0, enemy: 0 },
  };
  const bucket: Record<string, keyof typeof objectives> = {
    DragonKill: 'dragons',
    BaronKill: 'barons',
    HeraldKill: 'heralds',
    TurretKilled: 'towers',
  };
  for (const event of raw.events?.Events ?? []) {
    const key = bucket[event.EventName];
    const team = killerTeam(event.KillerName);
    if (!key || !team) continue;
    objectives[key][team === allyTeam ? 'ally' : 'enemy']++;
  }

  const teamKills = { ally: 0, enemy: 0 };
  for (const player of raw.allPlayers) {
    teamKills[player.team === allyTeam ? 'ally' : 'enemy'] += player.scores.kills;
  }

  const minutes = raw.gameData.gameTime / 60;
  return {
    gameTime: raw.gameData.gameTime,
    gameMode: raw.gameData.gameMode,
    me: me && {
      championName: me.championName,
      level: me.level,
      kills: me.scores.kills,
      deaths: me.scores.deaths,
      assists: me.scores.assists,
      cs: me.scores.creepScore,
      csPerMinute: minutes > 0 ? Math.round((me.scores.creepScore / minutes) * 10) / 10 : 0,
      gold: Math.floor(raw.activePlayer?.currentGold ?? 0),
      wardScore: Math.round(me.scores.wardScore),
    },
    teamKills,
    objectives,
  };
}
