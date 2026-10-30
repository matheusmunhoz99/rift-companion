const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');

const { summarize, todayEntries, currentRank, forQueue, ladderSeries } = loadTs('progress/rank-stats');

const e = (at, queue, win, lpChange, extra = {}) => ({
  at, queue, win, lpChange, tier: 'GOLD', division: 'II', lp: 50, championId: 1, note: null, ...extra,
});

test('summarize conta vitórias, derrotas e PDL líquido', () => {
  const s = summarize([e(5, 'solo', true, 20), e(4, 'solo', false, -18), e(3, 'solo', true, 22)]);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.netLp, 24);
  assert.equal(s.games, 3);
});

test('lossStreak conta derrotas desde a mais recente e dispara o tilt', () => {
  // Mais novas primeiro: 3 derrotas seguidas.
  const semTilt = summarize([e(5, 'solo', true, 20), e(4, 'solo', false, -18)]);
  assert.equal(semTilt.lossStreak, 0, 'última foi vitória');
  const comTilt = summarize([e(6, 'solo', false, -15), e(5, 'solo', false, -18), e(4, 'solo', false, -20), e(3, 'solo', true, 20)]);
  assert.equal(comTilt.lossStreak, 3);
  assert.equal(comTilt.tilt, true);
});

test('todayEntries pega só as de hoje, da fila certa', () => {
  const now = new Date('2026-10-30T20:00:00').getTime();
  const ontem = new Date('2026-10-29T22:00:00').getTime();
  const hojeCedo = new Date('2026-10-30T09:00:00').getTime();
  const entries = [e(now, 'solo', true, 20), e(hojeCedo, 'solo', false, -15), e(ontem, 'solo', true, 18), e(now, 'flex', true, 15)];
  const hoje = todayEntries(entries, 'solo', now);
  assert.equal(hoje.length, 2, 'duas partidas solo de hoje');
  assert.ok(hoje.every((x) => x.queue === 'solo'));
});

test('currentRank devolve a partida mais recente da fila', () => {
  const entries = [e(3, 'solo', true, 20, { lp: 30 }), e(9, 'solo', false, -15, { lp: 70 }), e(5, 'flex', true, 20)];
  assert.equal(currentRank(entries, 'solo').lp, 70, 'a mais nova (at=9)');
  assert.equal(currentRank(entries, 'flex').queue, 'flex');
  assert.equal(currentRank([], 'solo'), null);
});

test('ladderSeries acumula do mais antigo ao mais novo', () => {
  const entries = [e(3, 'solo', true, 20), e(2, 'solo', false, -10), e(1, 'solo', true, 15)];
  const series = ladderSeries(entries, 'solo');
  assert.deepEqual(series.map((p) => p.value), [15, 5, 25], 'soma cumulativa em ordem cronológica');
});

test('forQueue separa solo de flex', () => {
  const entries = [e(1, 'solo', true, 1), e(2, 'flex', true, 1), e(3, 'solo', true, 1)];
  assert.equal(forQueue(entries, 'flex').length, 1);
});
