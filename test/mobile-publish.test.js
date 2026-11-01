const test = require('node:test');
const assert = require('node:assert');
const { publishKey } = require('../dist-electron/mobile/link.js');

const at = (time, phase = 'InProgress') => ({ lcu: { gameflowPhase: phase }, prefs: {}, postgame: null, info: {}, game: time === null ? null : { time } });

test('celular: sem ninguém olhando, o relógio do jogo correndo não faz o PC publicar', () => {
  assert.strictEqual(publishKey(at(100), false), publishKey(at(102), false));
  assert.notStrictEqual(publishKey(at(100), true), publishKey(at(102), true), 'com o app aberto no celular, o relógio conta');
});

test('celular: mudança de fase sempre publica (aviso de partida começando no celular)', () => {
  assert.notStrictEqual(publishKey(at(null, 'ChampSelect'), false), publishKey(at(0, 'InProgress'), false));
  assert.notStrictEqual(publishKey(at(null, 'Lobby'), false), publishKey(at(null, 'ReadyCheck'), false));
});
