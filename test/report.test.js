const test = require('node:test');
const assert = require('node:assert');
const { scrub } = require('../dist-electron/report.js');

test('scrub apaga Riot ID da mensagem', () => {
  const out = scrub('Falha ao buscar Eu era o Jungle#jung na partida');
  assert.ok(!out.includes('#jung'), out);
  assert.ok(out.includes('<riot-id>'), out);
});

test('scrub apaga PUUID longo', () => {
  const puuid = 'a'.repeat(78);
  const out = scrub(`spectator 404 para ${puuid}`);
  assert.ok(!out.includes(puuid), out);
  assert.ok(out.includes('<id>'), out);
});

test('scrub apaga e-mail', () => {
  assert.ok(scrub('erro de login de fulano@gmail.com aqui').includes('<email>'));
});

test('scrub mantém mensagem normal intacta', () => {
  const msg = 'TypeError: Cannot read properties of undefined (reading champion)';
  assert.strictEqual(scrub(msg), msg);
});
