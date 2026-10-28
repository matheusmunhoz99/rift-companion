const assert = require('node:assert/strict');
const { test } = require('node:test');
const { riftUserId } = require('../dist-electron/riot/rift-users');

test('o código do Riot ID ignora maiúsculas e espaços e nunca leva o nick', () => {
  const id = riftUserId('Eu era o Jungle#jung');
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(riftUserId('  eu era o jungle # JUNG '), id);
  assert.notEqual(riftUserId('Eu era o Jungle#BR1'), id);
  assert.ok(!id.includes('jungle'));
  assert.equal(riftUserId('sem tag'), null);
});
