const assert = require('node:assert/strict');
const { test } = require('node:test');
const { objectiveAlerts } = require('../dist-electron/overlay/objective-alerts');

const dashboard = (gameTime, objectives, inhibitors = []) => ({ gameTime, objectives, timers: { dragon: null, baron: null, inhibitors } });
const dragon = (state) => [{ key: 'dragon', name: 'Dragão', state, at: 300 }];

test('avisa 1 min 30 s e 30 s antes de nascer, uma vez cada, e quando nasce', () => {
  const sent = new Set();
  const step = (time, state) => {
    const alerts = objectiveAlerts(dashboard(time, dragon(state)), sent);
    alerts.forEach((a) => sent.add(a.id));
    return alerts.map((a) => a.text);
  };
  assert.deepEqual(step(200, 'upcoming'), [], 'ainda longe');
  assert.deepEqual(step(211, 'upcoming'), ['Dragão nasce em 1 min 30 s (aos 5:00).']);
  assert.deepEqual(step(220, 'upcoming'), [], 'não repete');
  assert.deepEqual(step(250, 'upcoming'), [], 'entre os dois avisos');
  assert.deepEqual(step(271, 'upcoming'), ['Dragão nasce em 30 s (aos 5:00).']);
  assert.deepEqual(step(303, 'alive'), ['Dragão nasceu: está no mapa agora.']);
});

test('abrir no meio da partida não manda avisos atrasados nem o que já está no mapa', () => {
  // Faltando 1 min: o aviso de 1 min 30 s já passou e o de 30 s ainda não chegou.
  assert.deepEqual(objectiveAlerts(dashboard(240, dragon('upcoming')), new Set()), []);
  assert.deepEqual(objectiveAlerts(dashboard(900, [{ key: 'baron', name: "Barão Na'shor", state: 'alive', at: 600 }]), new Set()), []);
});

test('inibidor que vai voltar e objetivo que não volta mais', () => {
  const alerts = objectiveAlerts(
    dashboard(1000, [{ key: 'herald', name: 'Arauto do Vale', state: 'done', at: 900 }], [{ ally: false, lane: 'TOP', respawnAt: 1020 }]),
    new Set(),
  );
  assert.deepEqual(alerts.map((a) => a.text), ['Inibidor inimigo do TOP volta em 20 s.']);
});
