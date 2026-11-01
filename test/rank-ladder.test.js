const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { ladderValue, ladderLabel, ladderChart } = loadTs('progress/rank-stats');

const entry = (at, tier, division, lp, lpChange, win) => ({ at, queue: 'solo', tier, division, lp, lpChange, win, championId: 19, note: null });

test('escada: posição absoluta por elo, divisão e PDL', () => {
  assert.equal(ladderValue({ tier: 'IRON', division: 'IV', lp: 0 }), 0);
  assert.equal(ladderValue({ tier: 'PLATINUM', division: 'III', lp: 82 }), 4 * 400 + 100 + 82);
  assert.equal(ladderValue({ tier: 'MASTER', division: 'I', lp: 150 }), 2800 + 150);
  assert.equal(ladderValue({ tier: 'UNRANKED', division: '', lp: 0 }), null);
  assert.deepEqual(ladderLabel(1700), { tier: 'PLATINUM', division: 'III' });
  assert.deepEqual(ladderLabel(1899), { tier: 'PLATINUM', division: 'II' });
  assert.deepEqual(ladderLabel(2900), { tier: 'MASTER', division: null });
});

test('gráfico: subida de divisão aparece como subida (não volta a 0 PDL)', () => {
  const list = [
    entry(1, 'PLATINUM', 'IV', 90, 22, true),
    entry(2, 'PLATINUM', 'III', 12, 22, true), // subiu: 90 -> 112 na escada
    entry(3, 'PLATINUM', 'III', 0, -12, false),
  ];
  const chart = ladderChart(list, 'solo');
  assert.equal(chart.points.length, 3);
  assert.ok(chart.points[1].y < chart.points[0].y, 'ponto mais alto depois de subir de divisão');
  assert.equal(chart.net, 1700 - 1690);
  assert.equal(chart.wins, 2);
  assert.equal(chart.losses, 1);
  assert.ok(chart.grid.some((g) => g.value === 1700), 'linha da Platina III');
  assert.ok(chart.points.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100));
  assert.equal(ladderChart(list.slice(0, 1), 'solo'), null, 'uma partida só: sem gráfico');
});
