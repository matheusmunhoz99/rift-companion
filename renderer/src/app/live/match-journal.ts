import type { LiveDashboard, LivePlayer } from '../history/riot.types';

/** Botas de nível 2 (contam como compra mesmo custando menos que um item completo). */
const BOOTS = new Set([3006, 3009, 3020, 3047, 3111, 3117, 3158]);
/** A partir disso o item conta como "completo" (os componentes custam menos). */
const COMPLETED_COST = 2200;
/** Um ponto da evolução a cada 2 min de jogo. */
const TREND_EVERY_S = 120;

export interface JournalTrendPoint {
  t: number;
  kda: string;
  cs: number;
  csDiff: number | null;
  goldDiff: number | null;
}

/** O que aconteceu na partida até agora, do seu ponto de vista: a IA aprende com isso. */
export interface Journal {
  deaths: Array<{ t: number; killer: string }>;
  purchases: Array<{ t: number; itemId: number }>;
  trend: JournalTrendPoint[];
  previous: Array<{ t: number; opcoes: string[]; itens: number[] }>;
  /** Controle interno: mortes já anotadas e itens que você já tinha. */
  seenDeaths: string[];
  owned: number[];
  lastGameTime: number;
}

export function emptyJournal(): Journal {
  return { deaths: [], purchases: [], trend: [], previous: [], seenDeaths: [], owned: [], lastGameTime: 0 };
}

/**
 * Atualiza o diário com a leitura nova do jogo (a cada 2 s). Função pura: devolve o diário
 * novo. Tempo voltando (outra partida, replay) recomeça do zero.
 */
export function updateJournal(
  journal: Journal,
  data: LiveDashboard,
  itemCost: (id: number) => number,
  itemValue: (player: LivePlayer) => number,
): Journal {
  const j: Journal = data.gameTime + 5 < journal.lastGameTime ? emptyJournal() : { ...journal };
  j.lastGameTime = data.gameTime;
  const me = data.players.find((p) => p.isMe);
  if (!me) return j;
  const short = (riotId: string) => riotId.split('#')[0].toLowerCase();
  const myName = short(data.me?.riotId ?? me.riotId);

  // Mortes: eventos de abate em que você é a vítima (o jogo guarda os mais recentes).
  const championOf = (name: string) => data.players.find((p) => short(p.riotId) === name.toLowerCase())?.championName ?? name;
  const seen = new Set(j.seenDeaths);
  const deaths = [...j.deaths];
  for (const event of data.events) {
    if (event.kind !== 'kill' || event.victim.toLowerCase() !== myName) continue;
    const key = `${Math.round(event.time)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deaths.push({ t: Math.round(event.time), killer: championOf(event.killer) });
  }
  j.deaths = deaths.sort((a, b) => a.t - b.t).slice(-20);
  j.seenDeaths = [...seen].slice(-40);

  // Compras: itens completos e botas que apareceram no inventário.
  const now = me.items.map((i) => i.id).filter((id) => id > 0 && (BOOTS.has(id) || itemCost(id) >= COMPLETED_COST));
  const had = new Set(j.owned);
  const bought = now.filter((id) => !had.has(id));
  if (bought.length) j.purchases = [...j.purchases, ...bought.map((itemId) => ({ t: Math.round(data.gameTime), itemId }))].slice(-16);
  j.owned = [...new Set([...j.owned, ...now])];

  // Evolução contra o oponente da rota.
  const last = j.trend[j.trend.length - 1];
  if (data.gameTime >= 60 && (!last || data.gameTime - last.t >= TREND_EVERY_S)) {
    const opponent = me.position ? data.players.find((p) => !p.ally && p.position === me.position) : undefined;
    j.trend = [
      ...j.trend,
      {
        t: Math.round(data.gameTime),
        kda: `${me.kills}/${me.deaths}/${me.assists}`,
        cs: me.cs,
        csDiff: opponent ? me.cs - opponent.cs : null,
        goldDiff: opponent ? Math.round(itemValue(me) - itemValue(opponent)) : null,
      },
    ].slice(-30);
  }
  return j;
}

/** Guarda as opções de uma leitura para a próxima saber o que já foi sugerido. */
export function rememberRead(journal: Journal, t: number, opcoes: string[], itens: number[]): Journal {
  return { ...journal, previous: [...journal.previous, { t: Math.round(t), opcoes: opcoes.slice(0, 3), itens: itens.slice(0, 3) }].slice(-3) };
}

/** O que vai para o servidor: a evolução com no máximo 8 pontos espalhados pela partida. */
export function journalForRequest(journal: Journal): Pick<Journal, 'deaths' | 'purchases' | 'trend' | 'previous'> {
  const trend = journal.trend;
  const step = Math.max(1, Math.ceil(trend.length / 8));
  const sampled = trend.filter((_, i) => i % step === 0 || i === trend.length - 1).slice(-8);
  return { deaths: journal.deaths, purchases: journal.purchases, trend: sampled, previous: journal.previous };
}
