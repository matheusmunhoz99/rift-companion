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

test("objetivos do Summoner's Rift 2026: conta até o primeiro e, depois do abate, até o próximo", () => {
  const { DEFAULT_TIMINGS } = require('../dist-electron/overlay/live-dashboard.js');
  const byKey = (live) => Object.fromEntries(live.objectives.map((o) => [o.key, o]));

  // 21:02 no exemplo: 3 larvas e o arauto já abatidos; Barão nasceu aos 20:00; sem Atakhan.
  const now = byKey(toLiveDashboard(raw));
  assert.deepEqual(now.dragon, { key: 'dragon', name: 'Dragão', state: 'upcoming', at: 1102.7 + 300 });
  assert.equal(now.grubs.state, 'done');
  assert.equal(now.herald.state, 'done');
  assert.equal(now.atakhan, undefined, 'Atakhan saiu no patch 26.1');
  assert.deepEqual(now.baron, { key: 'baron', name: "Barão Na'shor", state: 'alive', at: 20 * 60 });

  // Começo da partida, sem abates: tudo conta até o primeiro surgimento.
  const early = structuredClone(raw);
  early.gameData.gameTime = 100;
  early.events.Events = [{ EventName: 'GameStart', EventTime: 0 }];
  const start = byKey(toLiveDashboard(early));
  assert.equal(start.dragon.at, DEFAULT_TIMINGS.dragonFirst);
  assert.equal(start.grubs.at, 8 * 60);
  assert.equal(start.herald.at, 15 * 60);
  assert.ok(Object.values(start).every((o) => o.state === 'upcoming'));

  // Larvas e Arauto saem do mapa na hora marcada mesmo sem abate.
  const late = structuredClone(early);
  late.gameData.gameTime = 19 * 60 + 50;
  const gone = byKey(toLiveDashboard(late));
  assert.equal(gone.grubs.state, 'done');
  assert.equal(gone.herald.state, 'done');

  // Alma dividida (2 a 2) não acaba os elementais no modo normal.
  const split = structuredClone(early);
  split.gameData.gameTime = 1800;
  split.events.Events = ['Suave#2415', 'THCPrôce#666', 'Suave#2415', 'THCPrôce#666'].map((KillerName, i) => ({
    EventName: 'DragonKill', EventTime: 400 + i * 300, KillerName, DragonType: 'Fire',
  }));
  assert.deepEqual(byKey(toLiveDashboard(split)).dragon, { key: 'dragon', name: 'Dragão', state: 'alive', at: 1300 + 300 });

  // Barão abatido volta 6 min depois.
  const baron = structuredClone(raw);
  baron.gameData.gameTime = 1700;
  baron.events.Events.push({ EventName: 'BaronKill', EventTime: 1600, KillerName: 'Suave#2415' });
  assert.equal(byKey(toLiveDashboard(baron)).baron.at, 1600 + 360);

  const aram = structuredClone(raw);
  aram.gameData.gameMode = 'ARAM';
  assert.deepEqual(toLiveDashboard(aram).objectives, []);
});

test('Partida Rápida: 2 dragões, Ancião aos 15:00 e a cada 6 min, Barão aos 12:00, sem Larvas e Arauto', () => {
  const { DEFAULT_TIMINGS_CONFIG, timingsForQueue } = require('../dist-electron/overlay/live-dashboard.js');
  const swift = timingsForQueue(DEFAULT_TIMINGS_CONFIG, 480);
  const byKey = (live) => Object.fromEntries(live.objectives.map((o) => [o.key, o]));
  const game = structuredClone(raw);
  game.gameData.gameTime = 200;
  game.events.Events = [];
  let o = byKey(toLiveDashboard(game, swift));
  assert.deepEqual(Object.keys(o).sort(), ['baron', 'dragon']);
  assert.equal(o.dragon.at, 5 * 60);
  assert.equal(o.baron.at, 12 * 60);

  // Primeiro dragão aos 5:10: o segundo volta 5 min depois.
  game.gameData.gameTime = 400;
  game.events.Events = [{ EventName: 'DragonKill', EventTime: 310, KillerName: 'Suave#2415', DragonType: 'Water' }];
  o = byKey(toLiveDashboard(game, swift));
  assert.deepEqual(o.dragon, { key: 'dragon', name: 'Dragão', state: 'upcoming', at: 610 });

  // Os dois elementais já saíram: o próximo é o Ancião, aos 15:00.
  game.gameData.gameTime = 700;
  game.events.Events.push({ EventName: 'DragonKill', EventTime: 640, KillerName: 'THCPrôce#666', DragonType: 'Fire' });
  o = byKey(toLiveDashboard(game, swift));
  assert.deepEqual(o.dragon, { key: 'dragon', name: 'Dragão Ancião', state: 'upcoming', at: 15 * 60 });

  // Ancião abatido volta 6 min depois.
  game.gameData.gameTime = 1000;
  game.events.Events.push({ EventName: 'DragonKill', EventTime: 950, KillerName: 'Suave#2415', DragonType: 'Elder' });
  assert.equal(byKey(toLiveDashboard(game, swift)).dragon.at, 950 + 360);

  // Fila sem perfil próprio usa o padrão.
  assert.equal(timingsForQueue(DEFAULT_TIMINGS_CONFIG, 420), DEFAULT_TIMINGS_CONFIG.default);
});

test('timers.json do servidor: perfis por fila; 0 desliga; valores inválidos ficam com o padrão', () => {
  const { parseTimingsConfig, DEFAULT_TIMINGS, timingsForQueue } = require('../dist-electron/overlay/live-dashboard.js');
  const config = parseTimingsConfig({
    default: { dragonFirst: 270, baronFirst: 'x', heraldSpawn: -1, extra: 5 },
    queues: { 480: { baronFirst: 600 }, 999: { grubsSpawn: 0 }, nome: { baronFirst: 1 } },
  });
  assert.equal(config.default.dragonFirst, 270);
  assert.equal(config.default.baronFirst, DEFAULT_TIMINGS.baronFirst);
  assert.equal(config.default.heraldSpawn, DEFAULT_TIMINGS.heraldSpawn);
  assert.equal('extra' in config.default, false);
  assert.equal(timingsForQueue(config, 480).baronFirst, 600);
  assert.equal(timingsForQueue(config, 480).dragonMax, 2, 'o resto do perfil embutido da Partida Rápida continua');
  assert.equal(timingsForQueue(config, 999).grubsSpawn, 0);
  assert.equal(config.queues.nome, undefined);
  // Formato antigo (só os tempos) vale como padrão.
  assert.equal(parseTimingsConfig({ dragonFirst: 280 }).default.dragonFirst, 280);
  assert.deepEqual(parseTimingsConfig(null).default, DEFAULT_TIMINGS);
});

test('Partida Rápida (SWIFTPLAY) é Summoner\'s Rift: mostra objetivos com os tempos dela', () => {
  const { SWIFTPLAY_TIMINGS } = require('../dist-electron/overlay/live-dashboard.js');
  const swift = structuredClone(raw);
  swift.gameData.gameMode = 'SWIFTPLAY';
  const live = toLiveDashboard(swift, SWIFTPLAY_TIMINGS);
  assert.ok(live.timers, 'timers de dragão, barão e inibidores');
  assert.ok(live.objectives.some((o) => o.key === 'baron'), 'Barão na lista de objetivos');
  assert.ok(!live.objectives.some((o) => o.key === 'grubs' || o.key === 'herald'), 'sem Larvas e Arauto nesse modo');
});
