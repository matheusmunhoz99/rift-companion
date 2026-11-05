import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type GameWindowMode = 'fullscreen' | 'windowed' | 'borderless' | 'unknown';

const MODES: Record<string, GameWindowMode> = { '0': 'fullscreen', '1': 'windowed', '2': 'borderless' };

function candidateDirectories(installDirectory: string | null): string[] {
  return [...new Set([installDirectory, 'C:\\Riot Games\\League of Legends'].filter((d): d is string => !!d))];
}

/**
 * Lê o modo de janela do jogo em Config/game.cfg (WindowMode=0/1/2).
 */
export async function readGameWindowMode(installDirectory: string | null): Promise<GameWindowMode> {
  for (const directory of candidateDirectories(installDirectory)) {
    try {
      const content = await readFile(path.join(directory, 'Config', 'game.cfg'), 'utf8');
      const match = content.match(/^\s*WindowMode\s*=\s*(\d)/m);
      if (match) return MODES[match[1]] ?? 'unknown';
    } catch {
      // Tenta o próximo diretório.
    }
  }
  return 'unknown';
}
