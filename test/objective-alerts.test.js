const assert = require('node:assert/strict');
const { test } = require('node:test');
const { objectiveAlerts } = require('../dist-electron/overlay/objective-alerts');

const dashboard = (gameTime, objectives, inhibitors = []) => ({ gameTime, objectives, timers: { dragon: null, baron: null, inhibitors } });

test('avisa 1 min antes de nascer, uma vez só, e de novo quando nasce', () => {
  const sent = new Set();
  const dragon = (state) => [{ key: 'dragon', name: 'Dragão', state, at: 300 }];
  assert.deepEqual(objectiveAlerts(dashboard(200, dragon('upcoming')), sent), [], 'ainda longe');
  const soon = objectiveAlerts(dashboard(241, dragon('upcoming')), sent);
  assert.equal(soon.length, 1);
  assert.equal(soon[0].text, 'Dragão nasce em 1 min (aos 5:00).');
  soon.forEach((a) => sent.add(a.id));
  assert.deepEqual(objectiveAlerts(dashboard(250, dragon('upcoming')), sent), [], 'não repete');
  const up = objectiveAlerts(dashboard(303, dragon('alive')), sent);
  assert.equal(up[0].text, 'Dragão nasceu: está no mapa agora.');
});

test('abrir no meio da partida não anuncia o que já está no mapa nem o que nasce em segundos', () => {
  assert.deepEqual(objectiveAlerts(dashboard(900, [{ key: 'baron', name: "Barão Na'shor", state: 'alive', at: 1200 - 600 }]), new Set()), []);
  assert.deepEqual(objectiveAlerts(dashboard(296, [{ key: 'dragon', name: 'Dragão', state: 'upcoming', at: 300 }]), new Set()), []);
});

test('inibidor que vai voltar e objetivo que não volta mais', () => {
  const alerts = objectiveAlerts(
    dashboard(1000, [{ key: 'herald', name: 'Arauto do Vale', state: 'done', at: 900 }], [{ ally: false, lane: 'TOP', respawnAt: 1020 }]),
    new Set(),
  );
  assert.deepEqual(alerts.map((a) => a.text), ['Inibidor inimigo do TOP volta em 20 s.']);
});
