const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { readTrigger, sessionKey } = loadTs('live/live-read-trigger');

test('leitura por IA: pede quando você morre, de rotina a cada 4 min, sem repetir em sequência', () => {
  const none = { at: null, deaths: 0 };
  assert.equal(readTrigger(60, 0, false, none), null, 'antes dos 3 min, nada');
  assert.equal(readTrigger(90, 1, true, none), 'death', 'morreu cedo: lê');
  assert.equal(readTrigger(200, 0, false, none), 'periodic', 'primeira de rotina aos 3 min');
  assert.equal(readTrigger(300, 0, false, { at: 200, deaths: 0 }), null, 'rotina só depois de 4 min');
  assert.equal(readTrigger(441, 0, false, { at: 200, deaths: 0 }), 'periodic');
  assert.equal(readTrigger(230, 1, true, { at: 200, deaths: 0 }), null, 'morte logo depois de outra leitura: espera');
  assert.equal(readTrigger(260, 1, true, { at: 200, deaths: 0 }), 'death');
  assert.equal(readTrigger(260, 1, false, { at: 200, deaths: 0 }), null, 'já renasceu: não é mais hora da leitura de morte');
  assert.equal(readTrigger(300, 1, true, { at: 260, deaths: 1 }), null, 'mesma morte não pede de novo');
});

test('leitura por IA: a partida vai ao servidor com um hash, não com o Riot ID', () => {
  const key = sessionKey('Eu era o Jungle#jung', 29000000);
  assert.equal(key, sessionKey('eu era o jungle#JUNG', 29000000), 'não depende de maiúsculas');
  assert.notEqual(key, sessionKey('Eu era o Jungle#jung', 29000001), 'outra partida, outra chave');
  assert.ok(!key.includes('jung'));
});

test('diário da partida: mortes com quem matou, compras de itens completos e evolução contra o oponente', () => {
  const { emptyJournal, updateJournal, rememberRead, journalForRequest } = loadTs('live/match-journal');
  const player = (riotId, championName, ally, isMe, extra = {}) => ({
    riotId, championName, championKey: championName, ally, isMe, position: 'JUNGLE', level: 10, kills: 2, deaths: 1, assists: 3, cs: 100,
    wardScore: 0, isDead: false, respawnTimer: 0, items: [], spellKeys: [], keystoneId: 0, ...extra,
  });
  const data = (gameTime, myItems, events) => ({
    gameTime, gameMode: 'CLASSIC', me: { riotId: 'Eu#br1', currentGold: 500, stats: null },
    players: [player('Eu#br1', 'Warwick', true, true, { items: myItems }), player('Rival#br1', 'Nocturne', false, false, { cs: 90 })],
    teams: {}, timers: null, objectives: [], events,
  });
  const cost = (id) => ({ 6672: 3000, 1036: 350, 3047: 1100 })[id] ?? 0;
  const value = (p) => p.items.reduce((t, i) => t + cost(i.id), 0);
  let j = emptyJournal();
  j = updateJournal(j, data(300, [{ id: 1036, count: 1 }], [{ time: 280, kind: 'kill', ally: false, killer: 'Rival', victim: 'Eu', detail: '' }]), cost, value);
  assert.deepEqual(j.deaths, [{ t: 280, killer: 'Nocturne' }]);
  assert.deepEqual(j.purchases, [], 'componente não conta');
  j = updateJournal(j, data(302, [{ id: 6672, count: 1 }, { id: 3047, count: 1 }], [{ time: 280, kind: 'kill', ally: false, killer: 'Rival', victim: 'Eu', detail: '' }]), cost, value);
  assert.equal(j.deaths.length, 1, 'mesma morte não repete');
  assert.deepEqual(j.purchases.map((p) => p.itemId), [6672, 3047]);
  assert.equal(j.trend.length, 1);
  assert.equal(j.trend[0].csDiff, 10);
  j = rememberRead(j, 302, ['a', 'b'], [3143]);
  assert.equal(journalForRequest(j).previous[0].itens[0], 3143);
  j = updateJournal(j, data(10, [], []), cost, value);
  assert.equal(j.deaths.length, 0, 'tempo voltou: partida nova');
});

test('selva: tempos do patch 26.1 e volta mais rápida na Partida Rápida', () => {
  const { campTiming, DEFAULT_JUNGLE } = loadTs('live/jungle-timings');
  assert.deepEqual(campTiming('buff', DEFAULT_JUNGLE), { first: 55, respawn: 300 });
  assert.deepEqual(campTiming('large', DEFAULT_JUNGLE), { first: 67, respawn: 135 });
  assert.deepEqual(campTiming('scuttle', DEFAULT_JUNGLE), { first: 175, respawn: 150 });
  const { timingsForQueue, DEFAULT_TIMINGS_CONFIG } = require('../dist-electron/overlay/live-dashboard.js');
  const swift = timingsForQueue(DEFAULT_TIMINGS_CONFIG, 480);
  assert.equal(swift.buffRespawn, 270);
  assert.equal(swift.campRespawn, 120);
  assert.equal(timingsForQueue(DEFAULT_TIMINGS_CONFIG, 420).campRespawn, 135);
});

test('visão: recorte do minimapa no canto certo (escala e lado) e quadro preto detectado', () => {
  const { minimapRegion, isBlack } = require('../dist-electron/vision/screen-vision.js');
  const right = minimapRegion({ width: 1920, height: 1080, scale: 1.44, flipped: false }, 1920, 1080);
  assert.deepEqual(right, { x: 1587, y: 747, width: 333, height: 333 });
  const left = minimapRegion({ width: 1920, height: 1080, scale: 1.44, flipped: true }, 1920, 1080);
  assert.equal(left.x, 0);
  assert.ok(minimapRegion({ scale: 3, flipped: false }, 1920, 1080).width <= 540, 'nunca passa de meia tela');
  const black = Buffer.alloc(100 * 100 * 4, 2);
  assert.equal(isBlack(black, 100, 100), true);
  const map = Buffer.alloc(100 * 100 * 4, 90);
  assert.equal(isBlack(map, 100, 100), false);
});

test('selva pela tela: posições espelhadas por time, leitura do número e moldura do mapa', () => {
  const { campPoints, timerSeconds, findMapBox, cropAround } = require('../dist-electron/vision/camp-detector.js');
  const red = campPoints('CHAOS');
  const blue = campPoints('ORDER');
  const ally = (list, id) => list.find((p) => p.key === `ally:${id}`);
  assert.ok(Math.abs(ally(red, 'blue').u - (1 - ally(blue, 'blue').u)) < 0.01, 'lado vermelho é o espelho do azul');
  assert.equal(red.filter((p) => p.key.startsWith('river:')).length, 2);
  assert.equal(timerSeconds('1:57'), 117);
  assert.equal(timerSeconds('40'), 40);
  assert.equal(timerSeconds('2m+'), null);
  assert.equal(timerSeconds(null), null);
  // Recorte 120x120: borda preta de 6 px em volta de um mapa claro de 100x100.
  const w = 120;
  const px = Buffer.alloc(w * w * 4, 0);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const inMap = x >= 10 && x < 110 && y >= 10 && y < 110;
    const border = !inMap && x >= 4 && x < 116 && y >= 4 && y < 116;
    const v = inMap ? 80 : border ? 0 : 40;
    px.fill(v, (y * w + x) * 4, (y * w + x) * 4 + 3);
  }
  const box = findMapBox(px, w, w);
  assert.ok(box && Math.abs(box.left - 10) <= 1 && Math.abs(box.size - 99) <= 2, JSON.stringify(box));
  const rect = cropAround(box, ally(red, 'krugs'), w, w);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= w && rect.y + rect.height <= w);
});
