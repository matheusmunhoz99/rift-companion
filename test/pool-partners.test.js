const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { rankPool } = loadTs('champ-select/pool-rank');
const { partnerStats } = loadTs('progress/partners');

const row = (championId, win, { position = 'jungle', mapId = 11, min = 25, mates = [], matchId = String(Math.random()) } = {}) => {
  const me = { puuid: 'me', riotId: 'Eu#br1', championId, teamId: 100, position, win };
  const participants = [me, ...mates.map((m, i) => ({ puuid: `p${i}`, riotId: m.riotId, championId: m.championId ?? 1, teamId: m.teamId ?? 100, win }))];
  return { match: { matchId, mapId, gameDurationSeconds: min * 60, participants }, me };
};

test('sugestão do pool: seu histórico na rota + confronto contra o inimigo da rota', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row(64, i < 4)), // Lee Sin 4V 2D
    ...Array.from({ length: 4 }, (_, i) => row(19, i < 2)), // Warwick 2V 2D
    row(233, true), // Briar: 1 partida só, fora
    row(103, true, { position: 'middle' }), row(103, true, { position: 'middle' }), // outra rota
    row(1, true, { mapId: 12 }), row(1, true, { mapId: 12 }), // ARAM, fora
  ];
  const pickable = new Set([64, 19, 233, 103, 1]);
  const tier = [{ championId: 64, position: 'JUNGLE', winRate: 0.49 }, { championId: 19, position: 'JUNGLE', winRate: 0.53 }];

  const plain = rankPool(rows, 'jungle', pickable, tier, null);
  assert.deepEqual(plain.map((s) => s.championId), [64, 19]);
  assert.equal(plain[0].games, 6);
  assert.equal(plain[0].matchup, null);

  // Warwick muito bom contra o inimigo da rota passa na frente.
  const counters = { championId: 99, position: 'JUNGLE', good: [{ championId: 19, games: 900, winRate: 0.6 }], bad: [{ championId: 64, games: 900, winRate: 0.44 }] };
  const vs = rankPool(rows, 'jungle', pickable, tier, counters);
  assert.deepEqual(vs.map((s) => s.championId), [19, 64]);
  assert.equal(vs[0].matchup, 0.6);

  // Só o que dá para pegar agora.
  assert.deepEqual(rankPool(rows, 'jungle', new Set([19]), tier, null).map((s) => s.championId), [19]);
});

test('com quem você ganha mais: sozinho x em grupo, parceiros e melhores campeões', () => {
  const duo = { riotId: 'Amigo#br1', championId: 412 };
  const rows = [
    row(64, true, { mates: [duo], matchId: 'a' }),
    row(64, true, { mates: [duo], matchId: 'b' }),
    row(64, false, { mates: [duo], matchId: 'c' }),
    row(19, false, { matchId: 'd' }),
    row(19, false, { matchId: 'e' }),
    row(19, true, { matchId: 'f' }),
    row(19, true, { matchId: 'g' }),
    row(1, true, { mapId: 30, mates: [duo], matchId: 'arena' }), // Arena: fora
  ];
  const group = { color: '#fff', label: 'Duo', confirmed: true };
  const partiesOf = (match) =>
    ['a', 'b', 'c'].includes(match.matchId) ? new Map([['eu#br1', group], ['amigo#br1', group]]) : new Map();

  const stats = partnerStats(rows, partiesOf);
  assert.deepEqual(stats.solo, { games: 4, wins: 2 });
  assert.deepEqual(stats.grouped, { games: 3, wins: 2 });
  assert.equal(stats.partners.length, 1);
  assert.equal(stats.partners[0].riotId, 'Amigo#br1');
  assert.deepEqual([stats.partners[0].games, stats.partners[0].wins], [3, 2]);
  assert.deepEqual(stats.partners[0].champions, [412]);
  assert.deepEqual(stats.champions.map((c) => c.championId), [64, 19]);
});
