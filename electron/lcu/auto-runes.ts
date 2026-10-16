import type { LcuConnector } from './connector';
import { lcuRequest } from './http';
import { applyRunePage, getRecommendedRunePages } from './perks';
import { applySummonerSpells } from './spells';

const SUMMONERS_RIFT = 11;

/**
 * Ao travar um campeão na seleção, importa a primeira página de runas que o
 * cliente recomenda (e os feitiços dela). Uma vez por campeão em cada seleção.
 */
export class AutoRunes {
  private appliedFor: number | null = null;

  constructor(
    private readonly connector: LcuConnector,
    private readonly isEnabled: () => boolean,
    private readonly onApplied: (result: { championId: number; pageName: string }) => void,
  ) {
    connector.on('state', () => void this.check());
  }

  private async check(): Promise<void> {
    const champSelect = this.connector.getState().champSelect;
    if (!champSelect) {
      this.appliedFor = null;
      return;
    }

    const championId = champSelect.championId;
    if (!championId || championId === this.appliedFor || !this.isEnabled()) return;
    const credentials = this.connector.getCredentials();
    if (!credentials) return;

    this.appliedFor = championId;
    try {
      const session = await lcuRequest<{ map?: { id?: number } }>(
        credentials,
        'GET',
        '/lol-gameflow/v1/session',
      ).catch(() => null);
      const mapId = session?.map?.id || SUMMONERS_RIFT;
      const [page] = await getRecommendedRunePages(
        credentials,
        championId,
        champSelect.assignedPosition,
        mapId,
      );
      if (!page) return;

      const result = await applyRunePage(credentials, page, `Auto ${page.keystone.name}`);
      await applySummonerSpells(credentials, page.summonerSpellIds).catch(() => undefined);
      this.onApplied({ championId, pageName: result.pageName });
    } catch (error) {
      console.warn('[auto-runes] Falha ao importar runas:', error);
    }
  }
}
