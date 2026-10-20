import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LcuConnector, LcuState } from './connector';
import { lcuRequest } from './http';

/**
 * Fim de partida: o placar que o próprio cliente monta assim que a partida acaba
 * (`/lol-end-of-game/v1/eog-stats-block`). Traz para os 10 jogadores o que a
 * Riot API do histórico não tem (dano recebido, mitigado, cura), sem esperar
 * a partida chegar no match-v5.
 */

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
  /** Participação nos abates do time (0 a 1). */
  killShare: number;
  /** Fatia do dano a campeões do time (0 a 1). */
  damageShare: number;
  /** Nota de 0 a 10 (o melhor da partida tem 10) e posição de 1 a 10. */
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

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
const num = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Pesos da nota. A ideia é premiar quem decidiu a partida em qualquer função:
 * participação e dano para quem luta, dano recebido/mitigado para quem segura,
 * visão para o suporte, ouro/CS para quem farmou, estruturas para quem empurrou.
 * Morrer muito desconta.
 */
const WEIGHTS = {
  killShare: 0.2,
  kda: 0.16,
  damage: 0.2,
  tank: 0.09,
  gold: 0.1,
  vision: 0.1,
  cs: 0.06,
  structures: 0.05,
  win: 0.04,
  deaths: 0.12,
};

/** Converte o eog-stats-block do cliente; null se ainda não há placar. */
export function parsePostGame(raw: unknown, now = Date.now()): PostGame | null {
  const root = obj(raw);
  const teams = Array.isArray(root.teams) ? root.teams.map(obj) : [];
  const myPuuid = str(obj(root.localPlayer).puuid);
  const players: Array<Omit<PostGamePlayer, 'killShare' | 'damageShare' | 'score' | 'rank'>> = [];

  for (const team of teams) {
    const teamId = num(team.teamId);
    const win = team.isWinningTeam === true;
    for (const entry of Array.isArray(team.players) ? team.players.map(obj) : []) {
      const stats = obj(entry.stats);
      const s = (key: string) => num(stats[key]);
      const gameName = str(entry.riotIdGameName) || str(entry.gameName) || str(entry.summonerName);
      const tag = str(entry.riotIdTagLine) || str(entry.tagLine);
      const puuid = str(entry.puuid);
      players.push({
        puuid,
        riotId: tag ? `${gameName}#${tag}` : gameName,
        championId: num(entry.championId),
        teamId: num(entry.teamId) || teamId,
        win,
        isMe: !!myPuuid && puuid === myPuuid,
        level: s('LEVEL') || num(entry.level),
        kills: s('CHAMPIONS_KILLED'),
        deaths: s('NUM_DEATHS'),
        assists: s('ASSISTS'),
        damageToChampions: s('TOTAL_DAMAGE_DEALT_TO_CHAMPIONS'),
        damageTaken: s('TOTAL_DAMAGE_TAKEN'),
        damageMitigated: s('TOTAL_DAMAGE_SELF_MITIGATED'),
        healing: s('TOTAL_HEAL'),
        gold: s('GOLD_EARNED'),
        cs: s('MINIONS_KILLED') + s('NEUTRAL_MINIONS_KILLED'),
        vision: s('VISION_SCORE'),
        wardsPlaced: s('WARD_PLACED'),
        wardsKilled: s('WARD_KILLED'),
        largestMultiKill: s('LARGEST_MULTI_KILL'),
        structureDamage: s('TOTAL_DAMAGE_DEALT_TO_BUILDINGS') || s('TOTAL_DAMAGE_DEALT_TO_TURRETS'),
        items: (Array.isArray(entry.items) ? entry.items : []).map(num).filter((id) => id > 0),
        spellIds: [num(entry.spell1Id), num(entry.spell2Id)].filter((id) => id > 0),
      });
    }
  }
  if (players.length < 2 || players.every((p) => p.damageToChampions === 0 && p.gold === 0))
    return null;

  const me = players.find((p) => p.isMe) ?? null;
  return {
    gameId: num(root.gameId),
    queueId: num(root.queueId) || null,
    queueType: str(root.queueType),
    gameMode: str(root.gameMode),
    durationSeconds: num(root.gameLength),
    endedAt: now,
    myTeamWon: me ? me.win : null,
    players: rankPlayers(players),
  };
}

/** Nota relativa à partida: cada estatística vale pela fração do melhor valor entre os 10. */
export function rankPlayers(
  players: Array<Omit<PostGamePlayer, 'killShare' | 'damageShare' | 'score' | 'rank'>>,
): PostGamePlayer[] {
  const teamTotals = new Map<number, { kills: number; damage: number }>();
  for (const p of players) {
    const t = teamTotals.get(p.teamId) ?? { kills: 0, damage: 0 };
    t.kills += p.kills;
    t.damage += p.damageToChampions;
    teamTotals.set(p.teamId, t);
  }
  const shares = players.map((p) => {
    const t = teamTotals.get(p.teamId)!;
    return {
      killShare: t.kills ? (p.kills + p.assists) / t.kills : 0,
      damageShare: t.damage ? p.damageToChampions / t.damage : 0,
      kda: (p.kills + p.assists) / Math.max(1, p.deaths),
      tank: p.damageTaken + p.damageMitigated,
    };
  });
  const max = (pick: (i: number) => number) => Math.max(1e-9, ...players.map((_, i) => pick(i)));
  const top = {
    killShare: max((i) => shares[i].killShare),
    kda: max((i) => shares[i].kda),
    damage: max((i) => players[i].damageToChampions),
    tank: max((i) => shares[i].tank),
    gold: max((i) => players[i].gold),
    vision: max((i) => players[i].vision),
    cs: max((i) => players[i].cs),
    structures: max((i) => players[i].structureDamage),
    deaths: max((i) => players[i].deaths),
  };
  const raw = players.map(
    (p, i) =>
      WEIGHTS.killShare * (shares[i].killShare / top.killShare) +
      WEIGHTS.kda * (shares[i].kda / top.kda) +
      WEIGHTS.damage * (p.damageToChampions / top.damage) +
      WEIGHTS.tank * (shares[i].tank / top.tank) +
      WEIGHTS.gold * (p.gold / top.gold) +
      WEIGHTS.vision * (p.vision / top.vision) +
      WEIGHTS.cs * (p.cs / top.cs) +
      WEIGHTS.structures * (p.structureDamage / top.structures) +
      WEIGHTS.win * (p.win ? 1 : 0) -
      WEIGHTS.deaths * (p.deaths / top.deaths),
  );
  const best = Math.max(1e-9, ...raw);
  const scored = players.map((p, i) => ({
    ...p,
    killShare: Math.min(1, shares[i].killShare),
    damageShare: shares[i].damageShare,
    score: Math.max(0, Math.round((raw[i] / best) * 100) / 10),
    rank: 0,
  }));
  [...scored]
    .sort((a, b) => b.score - a.score || b.damageToChampions - a.damageToChampions)
    .forEach((p, index) => (p.rank = index + 1));
  return scored;
}

const END_PHASES = new Set(['PreEndOfGame', 'EndOfGame']);
const RETRY_MS = 3_000;
const MAX_ATTEMPTS = 10;

/**
 * Busca o placar quando a partida acaba e guarda a última em disco (a tela
 * continua mostrando depois de reabrir o app). Evento `ready` com o resultado.
 */
export class PostGameService extends EventEmitter<{ ready: [PostGame] }> {
  private last: PostGame | null = null;
  private fetching = false;
  private handledGame = 0;
  private readonly file: string;

  constructor(
    private readonly connector: LcuConnector,
    directory: string,
    private readonly demoFile?: string,
  ) {
    super();
    this.file = path.join(directory, 'last.json');
    connector.on('state', (state: LcuState) => this.onState(state));
  }

  async get(): Promise<PostGame | null> {
    if (this.demoFile) return parsePostGame(JSON.parse(await readFile(this.demoFile, 'utf8')));
    if (this.last) return this.last;
    try {
      this.last = JSON.parse(await readFile(this.file, 'utf8')) as PostGame;
    } catch {
      this.last = null;
    }
    return this.last;
  }

  private onState(state: LcuState): void {
    if (!END_PHASES.has(state.gameflowPhase ?? '') || this.fetching) return;
    void this.fetch();
  }

  /** O placar pode demorar alguns segundos depois do fim; tenta de novo até vir. */
  private async fetch(): Promise<void> {
    this.fetching = true;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const credentials = this.connector.getCredentials();
        if (!credentials) return;
        const raw = await lcuRequest<unknown>(
          credentials,
          'GET',
          '/lol-end-of-game/v1/eog-stats-block',
        ).catch(() => null);
        const game = raw ? parsePostGame(raw) : null;
        if (game && game.gameId !== this.handledGame) {
          this.handledGame = game.gameId;
          this.last = game;
          await mkdir(path.dirname(this.file), { recursive: true });
          await writeFile(this.file, JSON.stringify(game));
          // O formato do cliente muda às vezes: guardar o original ajuda a ajustar o leitor.
          await writeFile(path.join(path.dirname(this.file), 'last-raw.json'), JSON.stringify(raw));
          this.emit('ready', game);
          return;
        }
        if (game) return;
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    } finally {
      this.fetching = false;
    }
  }
}
