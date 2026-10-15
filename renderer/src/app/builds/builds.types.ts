// Espelha electron/lcu/perks.ts e electron/builds/library.ts.
export interface RunePerk {
  id: number;
  name: string;
  styleId: number;
}

/** Fragmentos de atributo usam IDs 5xxx (a árvore Determinação também é 8400, então styleId não serve). */
export function isStatShard(perkId: number): boolean {
  return perkId >= 5000 && perkId < 6000;
}

export interface RunePageSuggestion {
  recommendationId: string;
  keystone: RunePerk;
  primaryStyleId: number;
  secondaryStyleId: number;
  perks: RunePerk[];
  summonerSpellIds: number[];
}

export interface ItemBuild {
  file: string;
  championId: number;
  position: string | null;
  title: string;
  maps: number[];
  blocks: Array<{ name: string; items: number[] }>;
}

export interface BuildsResponse {
  mapId: number;
  runePages: RunePageSuggestion[];
  itemBuilds: ItemBuild[];
  buildsDirectory: string;
}

export interface ApplyRunesResult {
  mode: 'updated' | 'created' | 'overwritten';
  pageName: string;
  spellsApplied: boolean;
}

export interface BuildsBridge {
  get(championId: number, position: string): Promise<BuildsResponse>;
  applyRunes(page: RunePageSuggestion, pageName: string, withSpells: boolean): Promise<ApplyRunesResult>;
  applyItems(championId: number, build: ItemBuild): Promise<string>;
}

declare global {
  interface Window {
    builds?: BuildsBridge;
  }
}
