const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WindowStateKeeper, fitsSomeDisplay, loadWindowState } = require('../dist-electron/window-state');

// Os dois monitores deste PC: o principal (1920x1080) e o segundo à esquerda (1536x864).
const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND = { x: -1920, y: 0, width: 1536, height: 824 };

function fakeWindow(bounds, flags = {}) {
  const listeners = {};
  return {
    on: (event, fn) => ((listeners[event] ??= []).push(fn)),
    emit: (event) => (listeners[event] ?? []).forEach((fn) => fn()),
    isDestroyed: () => false,
    isMinimized: () => flags.minimized ?? false,
    isFullScreen: () => flags.fullscreen ?? false,
    isMaximized: () => flags.maximized ?? false,
    getBounds: () => ({ ...bounds }),
    getNormalBounds: () => ({ ...(flags.normal ?? bounds) }),
  };
}

test('guarda o monitor e o lugar da janela e lê de volta', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rift-window-')), 'window-state.json');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  const win = fakeWindow({ x: -1700, y: 40, width: 1320, height: 780 });
  new WindowStateKeeper(file).attach(win);
  win.emit('close');
  assert.deepEqual(loadWindowState(file), { x: -1700, y: 40, width: 1320, height: 780, maximized: false });
});

test('maximizada: guarda o tamanho de antes e a marca de maximizada', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rift-window-')), 'window-state.json');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  const win = fakeWindow(SECOND, { maximized: true, normal: { x: -1800, y: 60, width: 1200, height: 700 } });
  new WindowStateKeeper(file).save(win);
  assert.deepEqual(loadWindowState(file), { x: -1800, y: 60, width: 1200, height: 700, maximized: true });
});

test('não grava o que o app faz sozinho (modo partida), nem tela cheia ou minimizada', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rift-window-')), 'window-state.json');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  new WindowStateKeeper(file, () => true).save(fakeWindow(PRIMARY));
  new WindowStateKeeper(file).save(fakeWindow(PRIMARY, { fullscreen: true }));
  new WindowStateKeeper(file).save(fakeWindow(PRIMARY, { minimized: true }));
  assert.equal(loadWindowState(file), null);
});

test('posição num monitor que não existe mais não vale (abre no lugar padrão)', () => {
  const onSecond = { x: -1700, y: 40, width: 1320, height: 780 };
  assert.equal(fitsSomeDisplay(onSecond, [PRIMARY, SECOND]), true);
  assert.equal(fitsSomeDisplay(onSecond, [PRIMARY]), false, 'segundo monitor desconectado');
  assert.equal(fitsSomeDisplay({ x: 1900, y: 40, width: 1320, height: 780 }, [PRIMARY]), false, 'barra de cima fora da tela');
});

test('janela encaixa na área útil (acima da barra de tarefas)', () => {
  const { clampToArea } = require('../dist-electron/window-state');
  const area = { x: 0, y: 0, width: 1920, height: 1032 };
  // Passava por baixo da barra de tarefas: sobe.
  assert.deepEqual(clampToArea({ x: 100, y: 300, width: 1320, height: 840 }, area), { x: 100, y: 192, width: 1320, height: 840 });
  // Maior que a tela: encolhe para a área útil.
  assert.deepEqual(clampToArea({ x: -50, y: -10, width: 2500, height: 1200 }, area), { x: 0, y: 0, width: 1920, height: 1032 });
  // Segundo monitor à direita.
  assert.deepEqual(clampToArea({ x: 3700, y: 50, width: 400, height: 300 }, { x: 1920, y: 0, width: 1920, height: 1040 }), { x: 3080, y: 50, width: 760, height: 560 });
});
