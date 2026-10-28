import { createHash } from 'node:crypto';

const API_URL = process.env.RIFT_API_URL ?? 'https://rift-api.workscanner.com.br';
/** Resposta da consulta guardada por jogador: a lista muda pouco durante uma partida. */
const LOOKUP_CACHE_MS = 10 * 60_000;
const MAX_LOOKUP = 20;

/**
 * Código do Riot ID que vai ao servidor no lugar do nick (SHA-256 com prefixo fixo).
 * Sem maiúsculas nem espaços nas pontas: "Nick#BR1" e "nick#br1" são o mesmo jogador.
 */
export function riftUserId(riotId: string): string | null {
  const [gameName, tagLine] = riotId.split('#');
  if (!gameName?.trim() || !tagLine?.trim()) return null;
  const normalized = `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
  return createHash('sha256').update(`rift-companion:${normalized}`).digest('hex');
}

/** Ícone de quem usa o Rift Companion: avisa que você usa e pergunta quem mais usa. */
export class RiftUsers {
  private readonly cache = new Map<string, { at: number; user: boolean }>();
  private announced: string | null = null;

  /** Ao conectar (e ao mudar a opção): aparece ou some para os outros usuários. */
  async announce(riotId: string, visible: boolean): Promise<void> {
    const id = riftUserId(riotId);
    const key = `${id}:${visible}`;
    if (!id || this.announced === key) return;
    await this.post('/v1/users/announce', { id, visible });
    this.announced = key;
  }

  /** Dos Riot IDs pedidos, os que usam o Rift Companion. Sem servidor: nenhum. */
  async lookup(riotIds: string[]): Promise<string[]> {
    const now = Date.now();
    const entries = [...new Set(riotIds)]
      .map((riotId) => ({ riotId, id: riftUserId(riotId) }))
      .filter((entry): entry is { riotId: string; id: string } => entry.id !== null)
      .slice(0, MAX_LOOKUP);
    const missing = entries.filter((e) => (this.cache.get(e.id)?.at ?? 0) < now - LOOKUP_CACHE_MS);
    if (missing.length) {
      try {
        const { users } = (await this.post('/v1/users/lookup', { ids: missing.map((e) => e.id) })) as { users?: string[] };
        const found = new Set(users ?? []);
        for (const { id } of missing) this.cache.set(id, { at: now, user: found.has(id) });
        if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value!);
      } catch {
        // Sem resposta: só fica sem ícone desta vez.
      }
    }
    return entries.filter((e) => this.cache.get(e.id)?.user).map((e) => e.riotId);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}
