const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// O updater importa "electron"; aqui só precisa da versão do app.
function loadUpdater() {
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return { app: { getVersion: () => '0.5.0-beta.8', isPackaged: true, getPath: () => os.tmpdir() } };
    return original.call(this, request, ...rest);
  };
  try {
    const file = require.resolve('../dist-electron/updater.js');
    delete require.cache[file];
    return require(file);
  } finally {
    Module._load = original;
  }
}

test('depois de atualizar, apaga só os .exe publicados de versões anteriores', async (t) => {
  const { removeOldVersions } = loadUpdater();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rift-updater-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const names = [
    'RiftCompanion-Beta-0.5.0-beta.5.exe',
    'RiftCompanion-Beta-0.5.0-beta.7.exe',
    'RiftCompanion-Beta-0.5.0-beta.8.exe', // a versão atual
    'RiftCompanion-Beta-0.6.0.exe', // mais nova: fica
    'RiftCompanion-Beta-0.5.0-beta.7-check.exe', // cópia renomeada: fica
    'Outro programa.exe',
  ];
  for (const name of names) await fs.writeFile(path.join(dir, name), 'x');

  const removed = await removeOldVersions(dir, '0.5.0-beta.8', 1);
  assert.deepEqual(removed.sort(), ['RiftCompanion-Beta-0.5.0-beta.5.exe', 'RiftCompanion-Beta-0.5.0-beta.7.exe']);
  assert.deepEqual((await fs.readdir(dir)).sort(), [
    'Outro programa.exe',
    'RiftCompanion-Beta-0.5.0-beta.7-check.exe',
    'RiftCompanion-Beta-0.5.0-beta.8.exe',
    'RiftCompanion-Beta-0.6.0.exe',
  ]);
  assert.deepEqual(await removeOldVersions(undefined), [], 'fora do .exe portátil não faz nada');
});
