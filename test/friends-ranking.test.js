const test = require('node:test');
const assert = require('node:assert/strict');
const { queueRank, recentOf, weekStartOf } = require('../dist-electron/lcu/friends-ranking');

const game = (queueId, win, at, duration = 1800) => ({
  queueId,
  gameCreation: at,
  gameDuration: duration,
  participants: [{ stats: { win } }],
});

test('semana começa na segunda 00:00 local', () => {
  const wednesday = new Date(2026, 10, 11, 21, 30).getTime();
  assert.equal(weekStartOf(wednesday), new Date(2026, 10, 9, 0, 0).getTime());
  const sunday = new Date(2026, 10, 15, 23, 0).getTime();
  assert.equal(weekStartOf(sunday), new Date(2026, 10, 9, 0, 0).getTime());
  const monday = new Date(2026, 10, 9, 0, 5).getTime();
  assert.equal(weekStartOf(monday), new Date(2026, 10, 9, 0, 0).getTime());
});

test('elo de uma fila com pico e temporada passada', () => {
  const raw = {
    queueMap: {
      RANKED_SOLO_5x5: {
        tier: 'GOLD', division: 'II', leaguePoints: 70, wins: 66, losses: 0,
        highestTier: 'PLATINUM', highestDivision: 'III', previousSeasonEndTier: 'GOLD', previousSeasonEndDivision: 'II',
      },
      RANKED_FLEX_SR: { tier: '', division: 'NA', leaguePoints: 0, wins: 0 },
    },
  };
  const solo = queueRank(raw, 'solo');
  assert.equal(solo.tier, 'GOLD');
  assert.equal(solo.division, 'II');
  assert.equal(solo.lp, 70);
  assert.equal(solo.peakTier, 'PLATINUM');
  assert.equal(solo.previousDivision, 'II');
  assert.equal(queueRank(raw, 'flex'), null);
});

test('sem temporada passada: divisão NA vira vazio', () => {
  const raw = { queueMap: { RANKED_SOLO_5x5: { tier: 'SILVER', division: 'I', leaguePoints: 10, previousSeasonEndTier: '', previousSeasonEndDivision: 'NA' } } };
  const solo = queueRank(raw, 'solo');
  assert.equal(solo.previousTier, '');
  assert.equal(solo.previousDivision, '');
});

test('semana e sequência só da fila pedida, sem remakes', () => {
  const weekStart = new Date(2026, 10, 9).getTime();
  const day = 24 * 60 * 60_000;
  const games = [
    game(420, false, weekStart + 3 * day),
    game(420, false, weekStart + 2 * day),
    game(440, true, weekStart + 2 * day),
    game(420, true, weekStart + 2 * day, 200), // remake
    game(420, false, weekStart + day),
    game(420, true, weekStart + day / 2),
    game(420, true, weekStart - day), // semana passada
  ];
  const solo = recentOf(games, 'solo', weekStart);
  assert.equal(solo.weekWins, 1);
  assert.equal(solo.weekLosses, 3);
  assert.equal(solo.streak, -3);
  assert.equal(solo.lastPlayed, weekStart + 3 * day);

  const flex = recentOf(games, 'flex', weekStart);
  assert.deepEqual([flex.weekWins, flex.weekLosses, flex.streak], [1, 0, 1]);

  const none = recentOf([], 'solo', weekStart);
  assert.deepEqual([none.weekWins, none.weekLosses, none.streak, none.lastPlayed], [0, 0, 0, null]);
});
