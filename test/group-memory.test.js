const test = require('node:test');
const assert = require('node:assert/strict');

// Stub de localStorage antes de carregar os módulos.
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { loadTs } = require('./helpers/renderer');
const { rememberGroups, rememberedGroups, rememberedCount } = loadTs('match/group-memory');
const { clientParties } = loadTs('match/client-groups');
const { partiesOf } = loadTs('match/parties');
const { toClientTeams, clientPartyQuery } = require('../dist-electron/riot/client-teams');

test('memória: guarda o par uma vez por partida e reconhece duo e trio no mesmo time', () => {
  storage.clear();
  rememberGroups('BR1_1', [['Duo A#BR1', 'Duo B#BR1']]);
  rememberGroups('BR1_1', [['duo a#br1', 'duo b#br1']]); // mesma partida: não soma
  rememberGroups('BR1_2', [['Duo B#BR1', 'Duo A#BR1']]);
  rememberGroups('BR1_3', [['X#1', 'Y#1'], ['Y#1', 'Z#1']]);
  assert.equal(rememberedCount(), 3);

  const team = ['Duo A#BR1', 'Duo B#BR1', 'Solo#BR1', 'X#1', 'Z#1', 'Y#1'];
  const groups = rememberedGroups(team);
  const duo = groups.find((g) => g.ids.includes('duo a#br1'));
  assert.deepEqual(duo.ids.sort(), ['duo a#br1', 'duo b#br1']);
  assert.equal(duo.times, 2);
  const trio = groups.find((g) => g.ids.includes('x#1'));
  assert.equal(trio.ids.length, 3, 'X+Y e Y+Z = trio');
  assert.equal(groups.some((g) => g.ids.includes('solo#br1')), false);
});

test('memória: par antigo (120+ dias) não vale', () => {
  storage.clear();
  const old = Date.now() - 121 * 24 * 60 * 60_000;
  rememberGroups('BR1_9', [['A#1', 'B#1']], old);
  assert.deepEqual(rememberedGroups(['A#1', 'B#1']), []);
});

test('cliente do LoL: grupos pelo time + campeão, autofill e times cobertos', () => {
  const session = {
    gameData: {
      gameId: 555,
      queue: { id: 420 },
      teamOne: [
        { puuid: 'local-a', championId: 19, teamParticipantId: 7, selectedPosition: 'JUNGLE', selectedRole: 'JUNGLE.PRIMARY.JUNGLE.MIDDLE' },
        { puuid: 'local-b', championId: 64, teamParticipantId: 7, selectedPosition: 'MIDDLE', selectedRole: 'MIDDLE.AUTOFILL.TOP.UTILITY' },
        { puuid: 'local-c', championId: 1, teamParticipantId: 9, selectedPosition: 'TOP', selectedRole: '' },
      ],
      teamTwo: [
        { puuid: '00000000-0000-0000-0000-000000000000', championId: 22, teamParticipantId: 3 },
        { puuid: 'local-y', championId: 99, teamParticipantId: null },
      ],
    },
  };
  const teams = toClientTeams(session);
  assert.equal(teams.gameId, 555);
  assert.equal(teams.players[0].teamId, 100);
  assert.equal(teams.players[1].autofill, true);
  assert.equal(teams.players[0].autofill, false);
  assert.equal(teams.players[2].autofill, null, 'sem dado não vira chute');
  assert.equal(teams.players[3].puuid, '', 'puuid zerado = oculto');
  assert.equal(teams.players[4].partyId, null);

  const participants = [
    { riotId: 'Jungle#BR1', teamId: 100, championId: 19 },
    { riotId: 'Mid#BR1', teamId: 100, championId: 64 },
    { riotId: 'Top#BR1', teamId: 100, championId: 1 },
    { riotId: 'Inimigo#BR1', teamId: 200, championId: 22 },
    { riotId: 'Outro#BR1', teamId: 200, championId: 99 },
  ];
  const info = clientParties(teams, participants, 555);
  assert.deepEqual(info.groups, [['jungle#br1', 'mid#br1']]);
  assert.deepEqual([...info.covered], [100], 'time 200 tem jogador sem grupo informado');
  assert.equal(info.autofill.get('mid#br1'), true);
  assert.equal(clientParties(teams, participants, 556), null, 'outra partida não vale');
  assert.ok(clientParties(teams, participants, 0), 'partida pelos dados locais (sem gameId) vale');

  const query = new URLSearchParams(clientPartyQuery(teams).slice(1));
  assert.equal(query.get('gameId'), '555');
  assert.equal(query.get('client'), '100.19.7,100.64.7,100.1.9,200.22.3', 'sem o jogador sem grupo');
  assert.equal(clientPartyQuery(null), '');
});

test('histórico: sem grupo salvo, a memória marca o duo como estimado', () => {
  storage.clear();
  rememberGroups('BR1_10', [['Amigo A#BR1', 'Amigo B#BR1']]);
  const p = (riotId, teamId) => ({ riotId, teamId, puuid: riotId, championId: 1, win: true, kills: 0, deaths: 0, assists: 0 });
  const match = { matchId: 'BR1_11', queueId: 420, gameEndTimestamp: 1, participants: [p('Amigo A#BR1', 100), p('Amigo B#BR1', 100), p('Solo#BR1', 100)] };
  const parties = partiesOf(match, []);
  assert.equal(parties.get('amigo a#br1')?.confirmed, false);
  assert.equal(parties.get('amigo b#br1')?.label, 'Duo');
  assert.equal(parties.get('solo#br1'), undefined);
});
