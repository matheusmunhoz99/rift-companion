import type { LivePlayer } from '../history/riot.types';

export interface ItemSpike {
  id: string;
  time: number;
  championName: string;
  itemId: number;
  itemName: string;
  /** Itens de alto impacto em lutas (Zhonya, Anjo Guardião, Bandana/Cimitarra) disparam aviso de voz. */
  important: boolean;
}

const CRITICAL_ITEMS: Record<number, { name: string; important: boolean }> = {
  3157: { name: 'Ampulheta de Zhonya', important: true },
  3026: { name: 'Anjo Guardião', important: true },
  3140: { name: 'Bandana de Mercúrio', important: true },
  3139: { name: 'Cimitarra Mercurial', important: true },
  3814: { name: 'Limiar da Noite', important: false },
  3102: { name: 'Véu da Banshee', important: false },
  3031: { name: 'Gume do Infinito', important: false },
  3089: { name: 'Capuz da Morte de Rabadon', important: false },
  3033: { name: 'Lembrete Mortal', important: false },
  3165: { name: 'Morellonomicon', important: false },
  3075: { name: 'Armadura de Espinhos', important: false },
};

/** Chave estável por jogador inimigo + item crítico. */
export function enemyItemKey(player: Pick<LivePlayer, 'riotId' | 'championName'>, itemId: number): string {
  return `${player.riotId || player.championName}|${itemId}`;
}

/**
 * Detecta novos itens críticos fechados pelo time inimigo em relação a `seenKeys`.
 * Quando `baselineOnly` é verdadeiro (primeiro snapshot da partida ou após reload), apenas
 * registra os itens já comprados para não disparar uma enxurrada de alertas atrasados.
 */
export function detectEnemyItemSpikes(
  players: ReadonlyArray<Pick<LivePlayer, 'ally' | 'riotId' | 'championName' | 'items'>>,
  gameTime: number,
  seenKeys: Set<string>,
  baselineOnly = false,
): ItemSpike[] {
  const spikes: ItemSpike[] = [];
  for (const player of players) {
    if (player.ally) continue;
    for (const item of player.items) {
      const spec = CRITICAL_ITEMS[item.id];
      if (!spec) continue;
      const key = enemyItemKey(player, item.id);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (!baselineOnly) {
        spikes.push({
          id: `${key}@${Math.round(gameTime)}`,
          time: gameTime,
          championName: player.championName,
          itemId: item.id,
          itemName: spec.name,
          important: spec.important,
        });
      }
    }
  }
  return spikes;
}
