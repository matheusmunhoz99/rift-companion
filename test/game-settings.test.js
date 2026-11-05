// Modo de janela do jogo lido em Config/game.cfg: node --test test/game-settings.test.js (depois de npm run build:electron).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readGameWindowMode } = require('../dist-electron/overlay/game-settings.js');

test('readGameWindowMode: lê WindowMode=0/1/2 do game.cfg', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-cfg-'));
  const cfgDir = path.join(dir, 'Config');
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfgFile = path.join(cfgDir, 'game.cfg');
  try {
    fs.writeFileSync(cfgFile, '[General]\r\nWidth=1920\r\nHeight=1080\r\nWindowMode=0\r\n', 'utf8');
    assert.equal(await readGameWindowMode(dir), 'fullscreen');
    fs.writeFileSync(cfgFile, '[General]\r\nWindowMode=1\r\n', 'utf8');
    assert.equal(await readGameWindowMode(dir), 'windowed');
    fs.writeFileSync(cfgFile, '[General]\r\nWindowMode=2\r\n', 'utf8');
    assert.equal(await readGameWindowMode(dir), 'borderless');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
