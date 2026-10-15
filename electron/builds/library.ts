import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ItemBuildBlock {
  name: string;
  items: number[];
}

export interface ItemBuild {
  file: string;
  championId: number;
  position: string | null;
  title: string;
  maps: number[];
  blocks: ItemBuildBlock[];
}

/**
 * Builds de itens em arquivos JSON. Diretórios posteriores têm prioridade:
 * um arquivo do usuário com o mesmo nome substitui o de exemplo.
 */
export async function loadBuilds(directories: string[]): Promise<ItemBuild[]> {
  const byFile = new Map<string, ItemBuild>();

  for (const directory of directories) {
    let files: string[];
    try {
      files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
        const build = parseBuild(file, raw);
        if (build) byFile.set(file, build);
      } catch (error) {
        console.warn(`[builds] Ignorando ${file}:`, error);
      }
    }
  }

  return [...byFile.values()];
}

/** Builds do campeão, com as da rota pedida primeiro. */
export function buildsForChampion(
  builds: ItemBuild[],
  championId: number,
  position: string,
): ItemBuild[] {
  return builds
    .filter((build) => build.championId === championId)
    .sort((a, b) => Number(b.position === position) - Number(a.position === position));
}

function parseBuild(file: string, raw: unknown): ItemBuild | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (typeof data['championId'] !== 'number' || !Array.isArray(data['blocks'])) return null;

  const blocks = (data['blocks'] as Array<Record<string, unknown>>)
    .filter((block) => typeof block['name'] === 'string' && Array.isArray(block['items']))
    .map((block) => ({
      name: block['name'] as string,
      items: (block['items'] as unknown[]).map(Number).filter(Number.isInteger),
    }));

  return {
    file,
    championId: data['championId'],
    position: typeof data['position'] === 'string' ? data['position'] : null,
    title: typeof data['title'] === 'string' ? data['title'] : file.replace(/\.json$/, ''),
    maps: Array.isArray(data['maps']) ? (data['maps'] as number[]) : [11],
    blocks,
  };
}
