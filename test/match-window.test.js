const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MatchWindow, fillsArea, sameBounds } = require('../dist-electron/match-window');

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };

function fakeWindow(bounds, flags = {}) {
  let current = { ...bounds };
  const calls = [];
  return {
    calls,
    move: (next) => (current = { ...next }),
    isDestroyed: () => false,
    isVisible: () => flags.visible ?? true,
    isMinimized: () => flags.minimized ?? false,
    isMaximized: () => flags.maximized ?? false,
    isFullScreen: () => false,
    getBounds: () => ({ ...current }),
    setBounds: (next) => {
      calls.push(next);
      current = { ...next };
    },
  };
}

test('janela cresce para a área útil e volta ao tamanho de antes', () => {
  const win = fakeWindow({ x: 300, y: 100, width: 1320, height: 840 });
  const match = new MatchWindow(() => win, () => AREA);
  assert.equal(match.enter(), true);
  assert.deepEqual(win.getBounds(), AREA);
  assert.equal(match.enter(), false, 'entrar de novo não faz nada');
  assert.equal(match.leave(), true);
  assert.deepEqual(win.getBounds(), { x: 300, y: 100, width: 1320, height: 840 });
  assert.equal(match.leave(), false, 'sair de novo não faz nada');
});

test('se a pessoa mexeu na janela durante a partida, não desfaz', () => {
  const win = fakeWindow({ x: 300, y: 100, width: 1320, height: 840 });
  const match = new MatchWindow(() => win, () => AREA);
  match.enter();
  win.move({ x: 1920, y: 0, width: 1000, height: 700 }); // levou para o outro monitor
  assert.equal(match.leave(), false);
  assert.deepEqual(win.getBounds(), { x: 1920, y: 0, width: 1000, height: 700 });
});

test('não mexe em janela escondida, minimizada, maximizada ou que já ocupa a tela', () => {
  for (const flags of [{ visible: false }, { minimized: true }, { maximized: true }]) {
    const win = fakeWindow({ x: 0, y: 0, width: 1000, height: 700 }, flags);
    assert.equal(new MatchWindow(() => win, () => AREA).enter(), false);
    assert.equal(win.calls.length, 0);
  }
  const full = fakeWindow({ x: 0, y: 0, width: 1916, height: 1036 });
  assert.equal(new MatchWindow(() => full, () => AREA).enter(), false);
  assert.equal(new MatchWindow(() => null, () => AREA).enter(), false);
});

test('folga de poucos pixels (bordas, DPI)', () => {
  assert.equal(fillsArea({ x: 0, y: 0, width: 1913, height: 1033 }, AREA), true);
  assert.equal(fillsArea({ x: 0, y: 0, width: 1800, height: 1040 }, AREA), false);
  assert.equal(sameBounds({ x: 0, y: 0, width: 1920, height: 1040 }, { x: 3, y: 2, width: 1916, height: 1037 }), true);
  assert.equal(sameBounds({ x: 0, y: 0, width: 1920, height: 1040 }, { x: 40, y: 0, width: 1920, height: 1040 }), false);
});

// Janela falsa com tela cheia, foco e o evento 'focus' (o que a tela cheia usa).
function fullscreenWindow({ focused = false } = {}) {
  let fullscreen = false;
  const listeners = new Map();
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isMaximized: () => false,
    isFocused: () => focused,
    isFullScreen: () => fullscreen,
    getBounds: () => ({ x: 2000, y: 0, width: 1320, height: 840 }),
    setBounds: () => undefined,
    setFullScreen: (on) => (fullscreen = on),
    once: (event, fn) => listeners.set(event, fn),
    removeListener: (event) => listeners.delete(event),
    emit(event) {
      focused = event === 'focus' ? true : focused;
      const fn = listeners.get(event);
      listeners.delete(event);
      fn?.();
    },
    waiting: (event) => listeners.has(event),
  };
}

test('tela cheia num segundo monitor entra na hora e sai no fim', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => true);
  assert.equal(match.fullscreen(true), true);
  assert.equal(win.isFullScreen(), true, 'outro monitor: não cobre o jogo, entra já');
  assert.equal(match.fullscreen(true), false, 'pedir de novo não faz nada');
  assert.equal(match.fullscreen(false), true);
  assert.equal(win.isFullScreen(), false);
});

test('no mesmo monitor do jogo, a tela cheia espera você vir para o app (Alt+Tab)', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => false);
  match.fullscreen(true);
  assert.equal(win.isFullScreen(), false, 'não cobre o jogo nem tira o foco dele');
  assert.equal(win.waiting('focus'), true);
  win.emit('focus');
  assert.equal(win.isFullScreen(), true, 'Alt+Tab para o app: tela cheia');
});

test('a partida acaba antes de você vir para o app: não entra em tela cheia depois', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => false);
  match.fullscreen(true);
  match.fullscreen(false);
  assert.equal(win.waiting('focus'), false);
  win.emit('focus');
  assert.equal(win.isFullScreen(), false);
});

test('já no app (com foco), entra em tela cheia na hora mesmo no monitor do jogo', () => {
  const win = fullscreenWindow({ focused: true });
  const match = new MatchWindow(() => win, () => AREA, () => false);
  match.fullscreen(true);
  assert.equal(win.isFullScreen(), true);
});
