const assert = require('node:assert/strict');
const { test } = require('node:test');
const raw = require('./fixtures/postgame/eog-stats-block.json');
const { parsePostGame } = require('../dist-electron/lcu/postgame.js');

test('placar de fim de jogo: 10 jogadores, você marcado e estatísticas do cliente', () => {
  const game = parsePostGame(raw, 1000);
  assert.equal(game.players.length, 10);
  assert.equal(game.durationSeconds, raw.gameLength);
  assert.equal(game.queueId, 480);
  assert.equal(game.endedAt, 1000);
  const me = game.players.find((p) => p.isMe);
  assert.ok(me, 'acha você pelo puuid do localPlayer');
  assert.equal(game.myTeamWon, me.win);
  const source = raw.teams.flatMap((t) => t.players).find((p) => p.puuid === me.puuid);
  assert.equal(me.damageTaken, source.stats.TOTAL_DAMAGE_TAKEN);
  assert.equal(me.cs, source.stats.MINIONS_KILLED + source.stats.NEUTRAL_MINIONS_KILLED);
  assert.match(me.riotId, /#/);
});

test('nota: o melhor tem 10, posições de 1 a 10 sem empate e participação entre 0 e 1', () => {
  const { players } = parsePostGame(raw);
  assert.deepEqual(players.map((p) => p.rank).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const byRank = [...players].sort((a, b) => a.rank - b.rank);
  assert.equal(byRank[0].score, 10);
  for (let i = 1; i < byRank.length; i++) assert.ok(byRank[i].score <= byRank[i - 1].score);
  for (const p of players) {
    assert.ok(p.killShare >= 0 && p.killShare <= 1);
    assert.ok(p.score >= 0 && p.score <= 10);
  }
  for (const teamId of [100, 200]) {
    const share = players.filter((p) => p.teamId === teamId).reduce((t, p) => t + p.damageShare, 0);
    assert.ok(Math.abs(share - 1) < 1e-9, 'fatias de dano do time somam 100%');
  }
});

test('morrer muito derruba a nota; números em texto também valem', () => {
  const worse = structuredClone(raw);
  const target = worse.teams[0].players[0];
  const before = parsePostGame(raw).players.find((p) => p.puuid === target.puuid).score;
  target.stats.NUM_DEATHS = 25;
  target.stats.CHAMPIONS_KILLED = String(target.stats.CHAMPIONS_KILLED);
  const after = parsePostGame(worse).players.find((p) => p.puuid === target.puuid);
  assert.ok(after.score < before);
  assert.equal(typeof after.kills, 'number');
});

test('sem placar ainda (lista vazia ou zerada) não mostra nada', () => {
  assert.equal(parsePostGame(null), null);
  assert.equal(parsePostGame({ teams: [] }), null);
  const empty = structuredClone(raw);
  for (const p of empty.teams.flatMap((t) => t.players)) p.stats = {};
  assert.equal(parsePostGame(empty), null);
});
