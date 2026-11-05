import https from 'node:https';
import { lanePosition } from './lanes';

/**
 * Live Client Data API: exposta pelo próprio jogo em https://127.0.0.1:2999
 * durante a partida. Só traz informação que o jogador já vê no jogo.
 */
// RIFT_LIVE_CLIENT_URL: só para testes com um jogo falso.
const LIVE_CLIENT_URL = process.env.RIFT_LIVE_CLIENT_URL ?? 'https://127.0.0.1:2999/liveclientdata/allgamedata';

// Certificado autoassinado da Riot; só fala com localhost.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

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
  gameData: { gameTime: number; gameMode: string; mapNumber?: number };
}

/** Leituras feitas há menos disso são reaproveitadas: painel, celular e avisos dividem a mesma. */
const SHARE_MS = 1_000;
let lastRead: { at: number; data: RawGameData | null } | null = null;
let reading: Promise<RawGameData | null> | null = null;

/**
 * Dados da partida pelo próprio jogo. Pedidos simultâneos ou seguidos (menos de 1 s)
 * recebem a mesma leitura, para o jogo responder uma vez só a cada ciclo.
 */
export function fetchRawGameData(): Promise<RawGameData | null> {
  if (lastRead && Date.now() - lastRead.at < SHARE_MS) return Promise.resolve(lastRead.data);
  reading ??= requestGameData().then((data) => {
    lastRead = { at: Date.now(), data };
    reading = null;
    return data;
  });
  return reading;
}

function requestGameData(): Promise<RawGameData | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: RawGameData | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = https.get(LIVE_CLIENT_URL, { agent: localAgent, timeout: 1500 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', () => done(null));
      // Resposta cortada no meio (jogo fechando): sem 'end', mas sempre com 'close'.
      response.on('close', () => done(null));
      response.on('end', () => {
        if (response.statusCode !== 200) return done(null);
        try {
          done(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RawGameData);
        } catch {
          done(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => done(null));
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
