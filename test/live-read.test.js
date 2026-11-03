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
