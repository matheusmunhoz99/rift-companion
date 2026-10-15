import { randomUUID } from 'node:crypto';
import type { ItemBuild } from '../builds/library';
import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';

interface ItemSet {
  uid: string;
  title: string;
  associatedChampions: number[];
  associatedMaps: number[];
  blocks: Array<{
    type: string;
    items: Array<{ id: string; count: number }>;
    hideIfSummonerSpell: string;
    showIfSummonerSpell: string;
  }>;
  map: string;
  mode: string;
  preferredItemSlots: unknown[];
  sortrank: number;
  startedFrom: string;
  type: string;
}

interface ItemSetsDocument {
  accountId: number;
  itemSets: ItemSet[];
  timestamp: number;
}

const TITLE_PREFIX = 'Rift: ';

/**
 * Grava a build como conjunto de itens da conta, associado ao campeão.
 * Conjuntos anteriores do app para o mesmo campeão são substituídos.
 */
export async function applyItemSet(
  credentials: LcuCredentials,
  summonerId: number,
  championId: number,
  build: ItemBuild,
): Promise<string> {
  const endpoint = `/lol-item-sets/v1/item-sets/${summonerId}/sets`;
  const document = await lcuRequest<ItemSetsDocument>(credentials, 'GET', endpoint);

  const title = (TITLE_PREFIX + build.title).slice(0, 75);
  const itemSets = document.itemSets.filter(
    (set) => !(set.title.startsWith(TITLE_PREFIX) && set.associatedChampions.includes(championId)),
  );

  itemSets.unshift({
    uid: randomUUID(),
    title,
    associatedChampions: [championId],
    associatedMaps: build.maps,
    blocks: build.blocks.map((block) => ({
      type: block.name,
      items: block.items.map((id) => ({ id: String(id), count: 1 })),
      hideIfSummonerSpell: '',
      showIfSummonerSpell: '',
    })),
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: 'blank',
    type: 'custom',
  });

  await lcuRequest(credentials, 'PUT', endpoint, {
    accountId: document.accountId,
    itemSets,
    timestamp: Date.now(),
  });
  return title;
}
