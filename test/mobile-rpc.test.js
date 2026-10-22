const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function registry() {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist-electron/mobile/rpc.js'), 'utf8'), {
    exports, require: () => ({ ipcMain: { handle() {} } }), Set, Map, Promise,
  });
  return exports;
}
test('controle Android permite só ações do cliente e bloqueia comandos fora de fase', async () => {
  const rpc = registry();
  for (const channel of ['app:open-builds-folder', 'update:install', 'mobile:approve', 'mobile:pair', 'arbitrary']) {
    rpc.ipcMain.handle(channel, () => { throw new Error('não deve executar'); });
    assert.throws(() => rpc.invokeMobile(channel, [], null, null), /disponível no PC/);
  }
  rpc.ipcMain.handle('lobby:create', (_event, queue) => queue);
  assert.equal(await rpc.invokeMobile('lobby:create', [420], 'None', 'None'), 420);
  assert.throws(() => rpc.invokeMobile('lobby:create', [420], 'Lobby', 'InProgress'), /fase.*mudou/);
  assert.throws(() => rpc.invokeMobile('lobby:create', [420], 'InProgress', 'InProgress'), /alterar a sala/);
  assert.throws(() => rpc.invokeMobile('lobby:ready-check', [true], 'None', 'None'), /aceitar agora/);
  assert.throws(() => rpc.invokeMobile('prefs:set', [{ startWithWindows: true }], null, null), /no PC/);
  rpc.ipcMain.handle('stats:meta', () => ({ matches: 20 }));
  assert.equal((await rpc.invokeMobile('stats:meta', [], 'Lobby', 'InProgress')).matches, 20);
});
