import { lanePosition } from './live-client';

/**
 * Painel ao vivo da partida a partir da Live Client Data API (allgamedata).
 * Só usa o que o próprio jogo mostra ao jogador (placar do Tab, avisos de
 * objetivos, seus atributos): nada de informação escondida pela névoa.
 * Dano causado por cada jogador não é exposto pela API durante a partida.
 */

type Team = 'ORDER' | 'CHAOS';

interface RawItem {
  itemID: number;
  count?: number;
  slot?: number;
}

interface RawPlayer {
  riotId?: string;
  summonerName?: string;
  championName: string;
  rawChampionName?: string;
  team: string;
  position?: string;
  level: number;
  isDead?: boolean;
  respawnTimer?: number;
  items?: RawItem[];
  summonerSpells?: Record<'summonerSpellOne' | 'summonerSpellTwo', { rawDisplayName?: string } | undefined>;
  runes?: { keystone?: { id: number } };
  scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number };
}

interface RawEvent {
  EventName: string;
  EventTime: number;
  KillerName?: string;
  VictimName?: string;
  Assisters?: string[];
  DragonType?: string;
  Stolen?: string;
  TurretKilled?: string;
  InhibKilled?: string;
  InhibRespawned?: string;
  KillStreak?: number;
  AcingTeam?: string;
  Recipient?: string;
}

export interface RawDashboardData {
  activePlayer?: {
    riotId?: string;
    summonerName?: string;
    currentGold?: number;
    level?: number;
    championStats?: Record<string, number>;
  };
  allPlayers: RawPlayer[];
  events?: { Events: RawEvent[] };
  gameData: { gameTime: number; gameMode: string; mapNumber?: number };
}

export interface LivePlayer {
  riotId: string;
  /** Nome interno no Data Dragon (ex.: "MonkeyKing"). */
  championKey: string;
  championName: string;
  ally: boolean;
  isMe: boolean;
  position: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wardScore: number;
  isDead: boolean;
  respawnTimer: number;
  /** Itens por slot (0-6); 0 = vazio. */
  items: Array<{ id: number; count: number }>;
  spellKeys: string[];
  keystoneId: number;
}

export interface LiveTeam {
  kills: number;
  towers: number;
  inhibitors: number;
  /** Tipos dos dragões na ordem em que caíram (Fire, Water, Earth, Air, Hextech, Chemtech, Elder). */
  dragons: string[];
  barons: number;
  heralds: number;
  grubs: number;
  atakhan: number;
}

export type LiveEventKind =
  | 'kill' | 'first-blood' | 'multikill' | 'ace' | 'dragon' | 'baron' | 'herald' | 'grubs' | 'atakhan' | 'tower' | 'inhibitor';

export interface LiveEvent {
  time: number;
  kind: LiveEventKind;
  /** Lado que fez o objetivo/abate; null quando não dá para saber. */
  ally: boolean | null;
  killer: string;
  victim: string;
  detail: string;
}

export interface LiveDashboard {
  gameTime: number;
  gameMode: string;
  players: LivePlayer[];
  me: {
    riotId: string;
    currentGold: number;
    stats: {
      attackDamage: number;
      abilityPower: number;
      armor: number;
      magicResist: number;
      attackSpeed: number;
      moveSpeed: number;
      critChance: number;
      lifeSteal: number;
      abilityHaste: number;
      currentHealth: number;
      maxHealth: number;
    } | null;
  } | null;
  teams: { ally: LiveTeam; enemy: LiveTeam };
  /**
   * Reaparecimentos depois do último abate, em segundos de jogo (modo clássico).
   * O primeiro surgimento muda entre temporadas e modos, por isso não é estimado.
   */
  timers: {
    dragon: { at: number; elder: boolean } | null;
    baron: number | null;
    /** Inibidores derrubados que ainda vão voltar; `ally` = inibidor do seu time. */
    inhibitors: Array<{ ally: boolean; lane: string; respawnAt: number }>;
  } | null;
  /** Mais recentes primeiro. */
  events: LiveEvent[];
}

const DRAGON_RESPAWN_S = 5 * 60;
const ELDER_RESPAWN_S = 6 * 60;
const BARON_RESPAWN_S = 6 * 60;
const INHIBITOR_RESPAWN_S = 5 * 60;
const MAX_EVENTS = 20;
const LANES: Record<string, string> = { L: 'Topo', C: 'Meio', R: 'Base' };

function emptyTeam(): LiveTeam {
  return { kills: 0, towers: 0, inhibitors: 0, dragons: [], barons: 0, heralds: 0, grubs: 0, atakhan: 0 };
}

/** "Turret_T1_..." / "Barracks_T2_..." pertencem ao ORDER (T1) ou ao CHAOS (T2). */
function structureOwner(name: string | undefined): Team | null {
  const match = /_T([12])_/.exec(name ?? '');
  return match ? (match[1] === '1' ? 'ORDER' : 'CHAOS') : null;
}

function inhibitorLane(name: string | undefined): string {
  return LANES[/_T[12]_([LCR])/.exec(name ?? '')?.[1] ?? ''] ?? '';
}

export function toLiveDashboard(raw: RawDashboardData): LiveDashboard {
  const nameOf = (p: RawPlayer) => p.riotId ?? p.summonerName ?? '';
  const myId = raw.activePlayer?.riotId ?? raw.activePlayer?.summonerName ?? '';
  const mine = raw.allPlayers.find((p) => nameOf(p) === myId) ?? null;
  const allyTeam: Team = mine?.team === 'CHAOS' ? 'CHAOS' : 'ORDER';

  // Eventos citam jogadores pelo Riot ID ou só pelo nome; minions e torres não têm time.
  const teamOf = new Map<string, Team>();
  for (const p of raw.allPlayers) {
    const team: Team = p.team === 'CHAOS' ? 'CHAOS' : 'ORDER';
    teamOf.set(nameOf(p), team);
    teamOf.set(nameOf(p).split('#')[0], team);
  }
  const playerTeam = (name?: string) => (name ? (teamOf.get(name) ?? teamOf.get(name.split('#')[0]) ?? null) : null);
  const side = (team: Team | null) => (team === null ? null : team === allyTeam);
  // Abates de estruturas e monstros vêm com o nome interno ("Turret_T1_L_02_A", "Minion_T100...", "SRU_...").
  const short = (name?: string) => {
    const value = name ?? '';
    if (/^Turret_/i.test(value)) return 'Torre';
    if (/^Minion_/i.test(value)) return 'Tropa';
    if (/^SRU_|^Sru_/.test(value)) return 'Monstro';
    return value.split('#')[0];
  };

  const teams = { ally: emptyTeam(), enemy: emptyTeam() };
  const bucket = (ally: boolean | null) => (ally === null ? null : ally ? teams.ally : teams.enemy);
  const events: LiveEvent[] = [];
  const inhibitors = new Map<string, { ally: boolean; lane: string; respawnAt: number }>();
  let lastDragon: number | null = null;
  let lastBaron: number | null = null;

  for (const event of raw.events?.Events ?? []) {
    const time = event.EventTime;
    const killerSide = side(playerTeam(event.KillerName));
    const push = (kind: LiveEventKind, ally: boolean | null, detail = '', victim = '') =>
      events.push({ time, kind, ally, killer: short(event.KillerName), victim: short(victim), detail });

    switch (event.EventName) {
      case 'ChampionKill': {
        // Abate por torre ou minion: credita o time contrário ao da vítima.
        const victimSide = side(playerTeam(event.VictimName));
        push('kill', killerSide ?? (victimSide === null ? null : !victimSide), String(event.Assisters?.length ?? 0), event.VictimName);
        break;
      }
      case 'FirstBlood':
        events.push({ time, kind: 'first-blood', ally: side(playerTeam(event.Recipient)), killer: short(event.Recipient), victim: '', detail: '' });
        break;
      case 'Multikill':
        if ((event.KillStreak ?? 0) >= 3) push('multikill', killerSide, String(event.KillStreak));
        break;
      case 'Ace':
        events.push({
          time, kind: 'ace', ally: event.AcingTeam ? event.AcingTeam === allyTeam : null, killer: '', victim: '', detail: '',
        });
        break;
      case 'DragonKill': {
        const type = event.DragonType ?? '';
        bucket(killerSide)?.dragons.push(type);
        lastDragon = time;
        push('dragon', killerSide, type + (event.Stolen === 'True' ? '|stolen' : ''));
        break;
      }
      case 'BaronKill':
        if (bucket(killerSide)) bucket(killerSide)!.barons++;
        lastBaron = time;
        push('baron', killerSide, event.Stolen === 'True' ? 'stolen' : '');
        break;
      case 'HeraldKill':
        if (bucket(killerSide)) bucket(killerSide)!.heralds++;
        push('herald', killerSide);
        break;
      case 'HordeKill':
        if (bucket(killerSide)) bucket(killerSide)!.grubs++;
        push('grubs', killerSide);
        break;
      case 'AtakhanKill':
        if (bucket(killerSide)) bucket(killerSide)!.atakhan++;
        push('atakhan', killerSide);
        break;
      case 'TurretKilled': {
        // Quem derrubou é o time contrário ao dono da torre (mesmo se o último golpe foi de um minion).
        const owner = structureOwner(event.TurretKilled);
        const ally = owner ? owner !== allyTeam : killerSide;
        if (bucket(ally)) bucket(ally)!.towers++;
        push('tower', ally);
        break;
      }
      case 'InhibKilled': {
        const owner = structureOwner(event.InhibKilled);
        const ally = owner ? owner !== allyTeam : killerSide;
        if (bucket(ally)) bucket(ally)!.inhibitors++;
        const lane = inhibitorLane(event.InhibKilled);
        if (owner && event.InhibKilled) {
          inhibitors.set(event.InhibKilled, { ally: owner === allyTeam, lane, respawnAt: time + INHIBITOR_RESPAWN_S });
        }
        push('inhibitor', ally, lane);
        break;
      }
      case 'InhibRespawned':
        if (event.InhibRespawned) inhibitors.delete(event.InhibRespawned);
        break;
    }
  }

  for (const p of raw.allPlayers) {
    const ally = (p.team === 'CHAOS' ? 'CHAOS' : 'ORDER') === allyTeam;
    (ally ? teams.ally : teams.enemy).kills += p.scores.kills;
  }

  const gameTime = raw.gameData.gameTime;
  // Com a alma conquistada (4 dragões elementais de um time), o próximo é o Ancião.
  const elemental = (t: LiveTeam) => t.dragons.filter((d) => d !== 'Elder').length;
  const soul = elemental(teams.ally) >= 4 || elemental(teams.enemy) >= 4;
  const dragonAt: number | null = lastDragon === null ? null : lastDragon + (soul ? ELDER_RESPAWN_S : DRAGON_RESPAWN_S);
  const timers = raw.gameData.gameMode === 'CLASSIC'
    ? {
        dragon: dragonAt === null ? null : { at: dragonAt, elder: soul },
        baron: lastBaron === null ? null : lastBaron + BARON_RESPAWN_S,
        inhibitors: [...inhibitors.values()].filter((i) => i.respawnAt > gameTime).sort((a, b) => a.respawnAt - b.respawnAt),
      }
    : null;

  const stats = raw.activePlayer?.championStats;
  const stat = (key: string) => Math.round((stats?.[key] ?? 0) * 100) / 100;

  return {
    gameTime,
    gameMode: raw.gameData.gameMode,
    players: raw.allPlayers.map((p) => {
      const items = Array.from({ length: 7 }, () => ({ id: 0, count: 0 }));
      for (const item of p.items ?? []) {
        const slot = item.slot ?? -1;
        if (slot >= 0 && slot < 7) items[slot] = { id: item.itemID, count: item.count ?? 1 };
      }
      return {
        riotId: nameOf(p),
        championKey: (p.rawChampionName ?? '').replace('game_character_displayname_', '') || p.championName,
        championName: p.championName,
        ally: (p.team === 'CHAOS' ? 'CHAOS' : 'ORDER') === allyTeam,
        isMe: p === mine,
        position: lanePosition(p.position),
        level: p.level,
        kills: p.scores.kills,
        deaths: p.scores.deaths,
        assists: p.scores.assists,
        cs: p.scores.creepScore,
        wardScore: Math.round(p.scores.wardScore),
        isDead: !!p.isDead,
        respawnTimer: Math.max(0, Math.round(p.respawnTimer ?? 0)),
        items,
        spellKeys: (['summonerSpellOne', 'summonerSpellTwo'] as const).map(
          (slot) => p.summonerSpells?.[slot]?.rawDisplayName?.match(/SummonerSpell_(\w+?)_DisplayName/)?.[1] ?? '',
        ),
        keystoneId: p.runes?.keystone?.id ?? 0,
      };
    }),
    me: mine
      ? {
          riotId: nameOf(mine),
          currentGold: Math.floor(raw.activePlayer?.currentGold ?? 0),
          stats: stats
            ? {
                attackDamage: Math.round(stat('attackDamage')),
                abilityPower: Math.round(stat('abilityPower')),
                armor: Math.round(stat('armor')),
                magicResist: Math.round(stat('magicResist')),
                attackSpeed: stat('attackSpeed'),
                moveSpeed: Math.round(stat('moveSpeed')),
                critChance: Math.round(stat('critChance') * 100),
                lifeSteal: Math.round(stat('lifeSteal') * 100),
                abilityHaste: Math.round(stat('abilityHaste')),
                currentHealth: Math.round(stat('currentHealth')),
                maxHealth: Math.round(stat('maxHealth')),
              }
            : null,
        }
      : null,
    teams,
    timers,
    events: events.sort((a, b) => b.time - a.time).slice(0, MAX_EVENTS),
  };
}
