/**
 * Memória de grupos deste PC: pares de jogadores (Riot ID minúsculo) que já entraram juntos
 * na fila, vistos com certeza (cliente do LoL ou a sua sala). Quando o par aparece de novo no
 * mesmo time, o selo de Duo/Trio sai na hora, antes de qualquer resposta do servidor.
 *
 * Só entra o que é certeza: estimativa do histórico nunca vira memória, para um palpite
 * errado não se repetir para sempre.
 */
const STORAGE_KEY = 'rift.groupMemory.v1';
/** Pares guardados; os vistos há mais tempo saem primeiro. ~150 bytes cada. */
const MAX_PAIRS = 3000;
/** Par que não aparece há 120 dias não vale mais. */
const MEMORY_MS = 120 * 24 * 60 * 60_000;

export interface RememberedPair {
  /** Partidas em que os dois estavam no mesmo grupo. */
  n: number;
  /** Última partida contada (a mesma não conta duas vezes). */
  g: string;
  /** Quando foi visto pela última vez (ms). */
  t: number;
}

type Memory = Record<string, RememberedPair>;

export function pairKey(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/** Última leitura: o histórico consulta a memória várias vezes seguidas com o mesmo conteúdo. */
let cache: { raw: string | null; memory: Memory } | null = null;

function read(): Memory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (cache && cache.raw === raw) return { ...cache.memory };
    const value = JSON.parse(raw ?? '{}') as unknown;
    const memory = value && typeof value === 'object' && !Array.isArray(value) ? (value as Memory) : {};
    cache = { raw, memory };
    return { ...memory };
  } catch {
    return {};
  }
}

function write(memory: Memory): void {
  const entries = Object.entries(memory)
    .filter(([, pair]) => Date.now() - pair.t < MEMORY_MS)
    .sort(([, a], [, b]) => b.t - a.t)
    .slice(0, MAX_PAIRS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Sem espaço: a memória só deixa de crescer.
  }
}

/** Guarda os grupos certos de uma partida (`game` evita contar a mesma duas vezes). */
export function rememberGroups(game: string, groups: string[][], now = Date.now()): void {
  const memory = read();
  let changed = false;
  for (const group of groups) {
    const ids = [...new Set(group.filter(Boolean).map((id) => id.toLowerCase()))];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        const pair = memory[key];
        if (pair?.g === game) continue;
        memory[key] = { n: (pair?.n ?? 0) + 1, g: game, t: now };
        changed = true;
      }
    }
  }
  if (changed) write(memory);
}

/**
 * Grupos que a memória reconhece entre jogadores do MESMO time (passe um time por vez).
 * Pares que se tocam viram um grupo só (A+B e B+C = trio). `times` = mais partidas juntos.
 */
export function rememberedGroups(team: string[], now = Date.now()): Array<{ ids: string[]; times: number }> {
  const ids = [...new Set(team.filter(Boolean).map((id) => id.toLowerCase()))];
  if (ids.length < 2) return [];
  const memory = read();
  const parent = new Map(ids.map((id) => [id, id]));
  const root = (id: string): string => {
    while (parent.get(id) !== id) id = parent.get(id)!;
    return id;
  };
  const times = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pair = memory[pairKey(ids[i], ids[j])];
      if (!pair || now - pair.t >= MEMORY_MS) continue;
      const a = root(ids[i]);
      const b = root(ids[j]);
      const best = Math.max(pair.n, times.get(a) ?? 0, times.get(b) ?? 0);
      parent.set(a, b);
      times.set(b, best);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(root(id), [...(groups.get(root(id)) ?? []), id]);
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([r, members]) => ({ ids: members, times: times.get(r) ?? 1 }));
}

/** Quantos pares a memória guarda (para a tela de configurações / diagnóstico). */
export function rememberedCount(): number {
  return Object.keys(read()).length;
}
