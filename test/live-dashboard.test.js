const assert = require('node:assert/strict');
const { test } = require('node:test');
const raw = require('./fixtures/live/allgamedata.json');
const { toLiveDashboard } = require('../dist-electron/overlay/live-dashboard.js');

test('placar e objetivos por time, inclusive torre derrubada por minion', () => {
  const live = toLiveDashboard(raw);
  assert.equal(live.teams.ally.kills, 18);
  assert.equal(live.teams.enemy.kills, 11);
  // Turret_T2_* é do CHAOS: derrubada pelo seu time mesmo com o último golpe de um minion.
  assert.equal(live.teams.ally.towers, 2);
  assert.equal(live.teams.enemy.towers, 1);
  assert.equal(live.teams.ally.inhibitors, 1);
  assert.deepEqual(live.teams.ally.dragons, ['Water', 'Hextech']);
  assert.deepEqual(live.teams.enemy.dragons, ['Fire']);
  assert.equal(live.teams.ally.grubs, 2);
  assert.equal(live.teams.enemy.grubs, 1);
  assert.equal(live.teams.ally.heralds, 1);
});

test('timers de dragão e inibidor contam do último abate; barão só depois do primeiro', () => {
  const live = toLiveDashboard(raw);
  assert.deepEqual(live.timers.dragon, { at: 1102.7 + 300, elder: false });
  assert.equal(live.timers.baron, null);
  assert.deepEqual(live.timers.inhibitors, [{ ally: false, lane: 'Meio', respawnAt: 1230.4 + 300 }]);

  const soul = structuredClone(raw);
  for (const [i, type] of ['Earth', 'Air'].entries()) {
    soul.events.Events.push({ EventName: 'DragonKill', EventTime: 1300 + i, KillerName: 'Skadi#CWB', DragonType: type });
  }
  assert.deepEqual(toLiveDashboard(soul).timers.dragon, { at: 1301 + 360, elder: true }, 'com a alma vem o Ancião');

  const respawned = structuredClone(raw);
  respawned.events.Events.push({ EventName: 'InhibRespawned', EventTime: 1500, InhibRespawned: 'Barracks_T2_C1' });
  assert.deepEqual(toLiveDashboard(respawned).timers.inhibitors, []);

  const aram = structuredClone(raw);
  aram.gameData.gameMode = 'ARAM';
  assert.equal(toLiveDashboard(aram).timers, null);
});

test('lances recentes primeiro; abate por torre vai para o time contrário ao da vítima', () => {
  const live = toLiveDashboard(raw);
  assert.equal(live.events[0].kind, 'kill');
  assert.equal(live.events[0].time, 1248);
  const turretKill = live.events.find((e) => e.kind === 'kill' && e.victim === 'Suave');
  assert.equal(turretKill.ally, false);
  assert.equal(turretKill.killer, 'Torre', 'nome interno da torre vira "Torre"');
  const stolen = live.events.find((e) => e.kind === 'dragon' && e.detail.startsWith('Hextech'));
  assert.equal(stolen.detail, 'Hextech|stolen');
  assert.equal(stolen.ally, true);
});

test('jogadores com itens por slot, mortos e seus atributos', () => {
  const live = toLiveDashboard(raw);
  const me = live.players.find((p) => p.isMe);
  assert.equal(me.championKey, 'Warwick');
  assert.equal(me.position, 'JUNGLE');
  assert.equal(me.items[6].id, 3340, 'sentinela no slot 6');
  const yasuo = live.players.find((p) => p.championName === 'Yasuo');
  assert.equal(yasuo.ally, false);
  assert.equal(yasuo.isDead, true);
  assert.equal(yasuo.respawnTimer, 18);
  assert.equal(live.me.currentGold, 1342);
  assert.equal(live.me.stats.critChance, 25);
  assert.equal(live.me.stats.attackDamage, 212);
});
