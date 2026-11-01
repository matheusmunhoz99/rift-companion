const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { buildInsights, benchmarkCsPerMin, focusOf } = loadTs('home/insights');

const row = (championId, win, { k = 5, d = 5, a = 5, cs = 150, min = 25, position = 'jungle', mapId = 11 } = {}) => ({
  match: { matchId: String(Math.random()), queueId: 420, mapId, gameVersion: '16.21', gameEndTimestamp: 0, gameDurationSeconds: min * 60, participants: [] },
  me: { puuid: 'me', riotId: 'Eu#br', championId, teamId: 100, position, win, kills: k, deaths: d, assists: a, champLevel: 15, cs, gold: 10000, damageToChampions: 20000, visionScore: 20, items: [], summonerSpellIds: [], perks: {} },
});

test('seu momento: forma, melhor campeão (3+ jogos) e campeão mais jogado; ARAM fora', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row(19, i < 4)), // Warwick 4V 2D
    row(64, true), row(64, true), // Lee Sin 2 jogos: não conta como "melhor"
    row(233, true), row(233, true), row(233, true), // Briar 3V
    row(1, false, { mapId: 12 }), // ARAM: fora
    ...Array.from({ length: 8 }, () => row(19, false)), // partidas antigas: derrotas
  ];
  const ins = buildInsights(rows);
  assert.equal(ins.form.games, 10);
  assert.equal(ins.form.wins, 8);
  assert.equal(ins.form.trend, 'up');
  assert.equal(ins.main.championId, 19, 'mais jogado');
  assert.equal(ins.best.championId, 233, 'melhor com 3+ jogos');
  assert.equal(Math.round(ins.main.csPerMin * 10) / 10, 6);
});

test('seu momento: foco no farm quando bem abaixo do Mestre+, nunca para suporte', () => {
  const rows = Array.from({ length: 5 }, () => row(19, true, { cs: 100, min: 25 })); // 4 CS/min
  const ins = buildInsights(rows);
  assert.equal(benchmarkCsPerMin([{ minute: 10, cs: 60 }, { minute: 15, cs: 96 }, { minute: 25, cs: 200 }]), 6.4);
  const focus = focusOf(ins, 'Warwick', 6.4);
  assert.equal(focus.kind, 'farm');
  assert.match(focus.text, /6\.4 CS\/min de Warwick; você está com 4\.0/);
  const support = buildInsights(Array.from({ length: 5 }, () => row(117, true, { cs: 30, position: 'utility' })));
  assert.notEqual(focusOf(support, 'Lulu', 6.4).kind, 'farm');
  assert.equal(buildInsights(rows.slice(0, 2)), null, 'menos de 3 partidas: sem análise');
});

test('seu momento: "melhor campeão" exige pelo menos 50% de vitórias', () => {
  const rows = Array.from({ length: 16 }, (_, i) => row(19, i < 5)); // Warwick 5V 11D (31%)
  const ins = buildInsights(rows);
  assert.equal(ins.best, null);
  assert.equal(ins.main.championId, 19);
});
