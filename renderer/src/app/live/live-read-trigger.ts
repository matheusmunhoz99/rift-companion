/** Leitura de rotina a cada 4 min de jogo, a partir dos 3 min (antes disso não há o que ler). */
export const PERIODIC_EVERY_S = 240;
export const FIRST_READ_S = 180;
/** Entre duas leituras automáticas, pelo menos isso de jogo (mortes seguidas não disparam várias). */
export const MIN_GAP_S = 45;

export interface ReadMark {
  /** Tempo de jogo da última leitura (null = nenhuma ainda). */
  at: number | null;
  /** Suas mortes quando ela foi feita. */
  deaths: number;
}

/**
 * Quando pedir uma leitura nova à IA: logo depois de você morrer (dá tempo de ler enquanto
 * espera renascer) ou de rotina. Função pura: quem chama guarda a marca da última leitura.
 */
export function readTrigger(gameTime: number, deaths: number, isDead: boolean, last: ReadMark): 'death' | 'periodic' | null {
  if (last.at !== null && gameTime - last.at < MIN_GAP_S) return null;
  if (isDead && deaths > last.deaths) return 'death';
  if (gameTime >= FIRST_READ_S && (last.at === null || gameTime - last.at >= PERIODIC_EVERY_S)) return 'periodic';
  return null;
}

/** Hash curto (FNV-1a) para identificar a partida no cache do servidor sem mandar o Riot ID. */
export function sessionKey(riotId: string, startedAtMinute: number): string {
  let hash = 0x811c9dc5;
  for (const char of `${riotId.toLowerCase()}|${startedAtMinute}`) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
