import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';

export interface RunePerk {
  id: number;
  name: string;
  styleId: number;
}

export interface RunePageSuggestion {
  recommendationId: string;
  keystone: RunePerk;
  primaryStyleId: number;
  secondaryStyleId: number;
  perks: RunePerk[];
  summonerSpellIds: number[];
}

export interface ApplyRunesResult {
  mode: 'updated' | 'created' | 'overwritten';
  pageName: string;
}

interface RecommendedPage {
  recommendationId: string;
  keystone: RunePerk;
  primaryPerkStyleId: number;
  secondaryPerkStyleId: number;
  perks: RunePerk[];
  summonerSpellIds: number[];
}

interface PerkPage {
  id: number;
  name: string;
  current: boolean;
  isEditable: boolean;
  isDeletable: boolean;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
}

interface PerkInventory {
  canAddCustomPage: boolean;
}

/** Prefixo das páginas criadas pelo app; só elas são reaproveitadas sem perguntar. */
export const PAGE_PREFIX = 'Rift: ';

/** Páginas que o próprio cliente da Riot recomenda para o campeão/rota/mapa. */
export async function getRecommendedRunePages(
  credentials: LcuCredentials,
  championId: number,
  position: string,
  mapId: number,
): Promise<RunePageSuggestion[]> {
  const pages = await lcuRequest<RecommendedPage[]>(
    credentials,
    'GET',
    `/lol-perks/v1/recommended-pages/champion/${championId}/position/${position || 'none'}/map/${mapId}`,
  );

  return pages.map((page) => ({
    recommendationId: page.recommendationId,
    keystone: pickPerk(page.keystone),
    primaryStyleId: page.primaryPerkStyleId,
    secondaryStyleId: page.secondaryPerkStyleId,
    perks: page.perks.map(pickPerk),
    summonerSpellIds: page.summonerSpellIds ?? [],
  }));
}

/**
 * Grava a página como atual: reaproveita a página "Rift:", senão cria uma nova
 * e, sem espaço para novas páginas, sobrescreve a página atual editável.
 */
export async function applyRunePage(
  credentials: LcuCredentials,
  suggestion: RunePageSuggestion,
  pageName: string,
): Promise<ApplyRunesResult> {
  const name = (PAGE_PREFIX + pageName).slice(0, 25);
  const content = {
    name,
    primaryStyleId: suggestion.primaryStyleId,
    subStyleId: suggestion.secondaryStyleId,
    selectedPerkIds: suggestion.perks.map((perk) => perk.id),
    current: true,
  };

  const pages = await lcuRequest<PerkPage[]>(credentials, 'GET', '/lol-perks/v1/pages');
  const ownPage = pages.find((page) => page.isEditable && page.name.startsWith(PAGE_PREFIX));
  if (ownPage) {
    await replacePage(credentials, ownPage, content);
    return { mode: 'updated', pageName: name };
  }

  const inventory = await lcuRequest<PerkInventory>(credentials, 'GET', '/lol-perks/v1/inventory');
  if (inventory.canAddCustomPage) {
    await lcuRequest(credentials, 'POST', '/lol-perks/v1/pages', content);
    return { mode: 'created', pageName: name };
  }

  const currentPage = pages.find((page) => page.current && page.isEditable);
  if (!currentPage) throw new Error('Nenhuma página de runas editável disponível.');
  await replacePage(credentials, currentPage, content);
  return { mode: 'overwritten', pageName: name };
}

async function replacePage(
  credentials: LcuCredentials,
  page: PerkPage,
  content: Record<string, unknown>,
): Promise<void> {
  await lcuRequest(credentials, 'PUT', `/lol-perks/v1/pages/${page.id}`, { ...page, ...content });
  await lcuRequest(credentials, 'PUT', '/lol-perks/v1/currentpage', page.id);
}

function pickPerk(perk: RunePerk): RunePerk {
  return { id: perk.id, name: perk.name, styleId: perk.styleId };
}
