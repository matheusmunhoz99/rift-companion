// Conversão dos dados do jogo (porta 2999) para o overlay: node test/overlay.test.js (depois de npm run build:electron).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toOverlayData } = require('../dist-electron/overlay/live-client.js');

const player = (riotId, team, k = 0, d = 0, a = 0, cs = 0) => ({
  riotId, championName: 'X', team, level: 10, scores: { kills: k, deaths: d, assists: a, creepScore: cs, wardScore: 10.4 },
});

function game({ mode = 'CLASSIC', time = 1500, events = [] } = {}) {
  return {
    activePlayer: { riotId: 'Eu#br1', currentGold: 999.9 },
    allPlayers: [player('Eu#br1', 'ORDER', 5, 2, 7, 150), player('Aliado#br1', 'ORDER', 3), player('Inimigo#br1', 'CHAOS', 4)],
    events: { Events: events },
    gameData: { gameTime: time, gameMode: mode },
  };
}

test('jogador, ouro, abates por time e CS por minuto', () => {
  const d = toOverlayData(game());
  assert.equal(d.me.kills, 5);
  assert.equal(d.me.gold, 999);
  assert.equal(d.me.csPerMinute, 6);
  assert.deepEqual(d.teamKills, { ally: 8, enemy: 4 });
});

test('objetivos contados por time; torre derrubada por tropa não conta', () => {
  const d = toOverlayData(game({ events: [
    { EventName: 'DragonKill', KillerName: 'Eu', EventTime: 400 },
    { EventName: 'DragonKill', KillerName: 'Inimigo#br1', EventTime: 800 },
    { EventName: 'TurretKilled', KillerName: 'Minion_T200L0S01N0001', EventTime: 900 },
    { EventName: 'TurretKilled', KillerName: 'Aliado', EventTime: 950 },
  ] }));
  assert.deepEqual(d.objectives.dragons, { ally: 1, enemy: 1 });
  assert.deepEqual(d.objectives.towers, { ally: 1, enemy: 0 });
});

test('timers: dragão volta 5 min após o último abate, barão 6 min', () => {
  const d = toOverlayData(game({ events: [
    { EventName: 'DragonKill', KillerName: 'Eu', EventTime: 400 },
    { EventName: 'DragonKill', KillerName: 'Inimigo', EventTime: 1000 },
    { EventName: 'BaronKill', KillerName: 'Aliado', EventTime: 1300 },
  ] }));
  assert.deepEqual(d.timers, { dragon: 1300, baron: 1660 });
});

test('timers: sem abate ainda, não estima o primeiro surgimento', () => {
  assert.deepEqual(toOverlayData(game()).timers, { dragon: null, baron: null });
});

test('timers: com a alma, o próximo é o Ancião (6 min)', () => {
  const kills = [300, 700, 1100, 1500].map((t) => ({ EventName: 'DragonKill', KillerName: 'Eu', EventTime: t }));
  assert.equal(toOverlayData(game({ time: 1600, events: kills })).timers.dragon, 1860);
});

test('timers só no modo clássico (Jogo Dinâmico e ARAM têm tempos próprios)', () => {
  const events = [{ EventName: 'DragonKill', KillerName: 'Eu', EventTime: 400 }];
  assert.equal(toOverlayData(game({ mode: 'SWIFTPLAY', events })).timers, null);
  assert.equal(toOverlayData(game({ mode: 'ARAM', events })).timers, null);
});
