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

const next = (d) => Object.fromEntries(d.upcoming.map((o) => [o.key, { state: o.state, at: o.at }]));

test('próximos objetivos com o primeiro surgimento e o reaparecimento depois do abate', () => {
  const early = next(toOverlayData(game({ time: 200 })));
  assert.deepEqual(early.dragon, { state: 'upcoming', at: 300 });
  assert.deepEqual(early.baron, { state: 'upcoming', at: 1200 });

  const d = next(toOverlayData(game({ events: [
    { EventName: 'DragonKill', KillerName: 'Eu', EventTime: 400, DragonType: 'Fire' },
    { EventName: 'DragonKill', KillerName: 'Inimigo', EventTime: 1000, DragonType: 'Water' },
    { EventName: 'BaronKill', KillerName: 'Aliado', EventTime: 1300 },
  ] })));
  assert.deepEqual(d.dragon, { state: 'alive', at: 1300 }, 'voltou às 21:40 e a partida está em 25:00');
  assert.deepEqual(d.baron, { state: 'upcoming', at: 1660 });
  assert.equal(d.herald, undefined, 'Arauto já saiu do mapa aos 19:45');
});

test('com a alma, o próximo dragão é o Ancião (6 min)', () => {
  const kills = [300, 700, 1100, 1500].map((t) => ({ EventName: 'DragonKill', KillerName: 'Eu', EventTime: t, DragonType: 'Fire' }));
  const d = toOverlayData(game({ time: 1600, events: kills }));
  const dragon = d.upcoming.find((o) => o.key === 'dragon');
  assert.equal(dragon.at, 1860);
  assert.equal(dragon.name, 'Dragão Ancião');
});

test('objetivos só no modo clássico', () => {
  assert.deepEqual(toOverlayData(game({ mode: 'ARAM' })).upcoming, []);
});

test('oponente é o inimigo da mesma rota; sem rotas, nenhum', () => {
  const g = game();
  g.allPlayers[0].position = 'MIDDLE';
  g.allPlayers[2].position = 'TOP';
  g.allPlayers.push({ ...player('Mid#br1', 'CHAOS', 1, 1, 1, 170), position: 'MIDDLE', items: [{ itemID: 1055, slot: 0 }] });
  const d = toOverlayData(g);
  assert.equal(d.opponent.cs, 170);
  assert.deepEqual(d.opponent.items[0], { id: 1055, count: 1 });
  assert.equal(d.me.position, 'MIDDLE');
  assert.equal(toOverlayData(game()).opponent, null);
});

test('níveis das habilidades do jogador', () => {
  const g = game();
  g.activePlayer.abilities = { Q: { abilityLevel: 3 }, W: { abilityLevel: 1 }, E: { abilityLevel: 2 }, R: { abilityLevel: 1 } };
  assert.deepEqual(toOverlayData(g).me.skills, [3, 1, 2, 1]);
  assert.equal(toOverlayData(game()).me.skills, null);
});
