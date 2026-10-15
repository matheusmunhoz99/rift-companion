import type { LcuCredentials } from './credentials';
import { lcuRequest } from './http';

interface MySelection {
  spell1Id: number;
  spell2Id: number;
}

/**
 * Aplica os feitiços na seleção de campeões, mantendo cada feitiço que o
 * jogador já usa (ex.: Flash) na mesma tecla (D/F).
 */
export async function applySummonerSpells(
  credentials: LcuCredentials,
  spellIds: number[],
): Promise<void> {
  if (spellIds.length !== 2) return;

  const session = await lcuRequest<{ myTeam: unknown[]; localPlayerCellId: number }>(
    credentials,
    'GET',
    '/lol-champ-select/v1/session',
  );
  const me = (session.myTeam as Array<MySelection & { cellId: number }>).find(
    (player) => player.cellId === session.localPlayerCellId,
  );

  let [spell1Id, spell2Id] = spellIds;
  if (me && (spell2Id === me.spell1Id || spell1Id === me.spell2Id)) {
    [spell1Id, spell2Id] = [spell2Id, spell1Id];
  }

  await lcuRequest(credentials, 'PATCH', '/lol-champ-select/v1/session/my-selection', {
    spell1Id,
    spell2Id,
  });
}
