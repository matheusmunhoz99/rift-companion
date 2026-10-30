const test = require('node:test');
const assert = require('node:assert/strict');

// Stub de localStorage antes de carregar o módulo (ele lê no topo).
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { loadTs } = require('./helpers/renderer');
const { partiesOf, rememberParties, PARTY_NAMES } = loadTs('match/parties');

const p = (riotId, teamId) => ({ riotId, teamId, puuid: riotId, championId: 1, win: true, kills: 0, deaths: 0, assists: 0 });
const match = (matchId, participants) => ({ matchId, queueId: 420, gameEndTimestamp: 1, participants });

test('rememberParties + partiesOf: grupo visto ao vivo fica confirmado', () => {
  storage.clear();
  rememberParties('BR1_1', [['Duo A#BR1', 'Duo B#BR1']]);
  const m = match('BR1_1', [p('Duo A#BR1', 100), p('Duo B#BR1', 100), p('Solo#BR1', 100)]);
  const parties = partiesOf(m, []);
  const a = parties.get('duo a#br1');
  assert.ok(a, 'Duo A está num grupo');
  assert.equal(a.confirmed, true, 'visto ao vivo = confirmado');
  assert.equal(a.label, PARTY_NAMES[2]);
  assert.equal(parties.get('solo#br1'), undefined, 'o solo não entra em grupo');
});

test('partiesOf infere pelo contexto quando não há grupo salvo', () => {
  storage.clear();
  const current = match('BR1_now', [p('X#BR1', 100), p('Y#BR1', 100), p('Z#BR1', 200)]);
  // Em outra partida do histórico, X e Y estiveram juntos no mesmo time.
  const other = match('BR1_old', [p('X#BR1', 200), p('Y#BR1', 200), p('W#BR1', 100)]);
  const parties = partiesOf(current, [current, other]);
  const x = parties.get('x#br1');
  assert.ok(x, 'X e Y inferidos como grupo');
  assert.equal(parties.get('y#br1').color, x.color, 'mesma cor = mesmo grupo');
  assert.equal(x.confirmed, false, 'inferido, não confirmado');
});

test('partiesOf não infere quem só se cruzou em times opostos', () => {
  storage.clear();
  const current = match('BR1_a', [p('A#BR1', 100), p('B#BR1', 100)]);
  const other = match('BR1_b', [p('A#BR1', 100), p('B#BR1', 200)]); // times opostos
  assert.equal(partiesOf(current, [current, other]).size, 0);
});

test('partiesOf sem contexto não inventa grupo', () => {
  storage.clear();
  const current = match('BR1_x', [p('A#BR1', 100), p('B#BR1', 100)]);
  assert.equal(partiesOf(current, []).size, 0);
});
