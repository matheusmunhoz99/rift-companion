const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
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

// Janela falsa com tela cheia, foco, minimização e eventos completos.
function fullscreenWindow({ focused = false, minimized = false } = {}) {
  let fullscreen = false;
  let visible = !minimized;
  const emitter = new EventEmitter();
  const win = {
    showInactiveCalls: 0,
    isDestroyed: () => false,
    isVisible: () => visible,
    isMinimized: () => minimized,
    isMaximized: () => false,
    isFocused: () => focused,
    isFullScreen: () => fullscreen,
    getBounds: () => ({ x: 2000, y: 0, width: 1320, height: 840 }),
    setBounds: () => undefined,
    setFullScreen: (on) => (fullscreen = on),
    showInactive: () => {
      win.showInactiveCalls++;
      minimized = false;
      visible = true;
    },
    on: (event, fn) => emitter.on(event, fn),
    once: (event, fn) => emitter.once(event, fn),
    removeListener: (event, fn) => emitter.removeListener(event, fn),
    emit(event) {
      if (event === 'focus') {
        focused = true;
        minimized = false;
        visible = true;
      } else if (event === 'blur') {
        focused = false;
      } else if (event === 'minimize') {
        minimized = true;
        visible = false;
        focused = false;
      } else if (event === 'restore') {
        minimized = false;
        visible = true;
      } else if (event === 'leave-full-screen') {
        fullscreen = false;
      }
      emitter.emit(event);
    },
    waiting: (event) => emitter.listenerCount(event) > 0,
  };
  return win;
}

test('tela cheia num segundo monitor entra na hora e sai no fim', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => true);
  try {
    assert.equal(match.fullscreen(true), true);
    assert.equal(win.isFullScreen(), true, 'outro monitor: não cobre o jogo, entra já');
    assert.equal(match.fullscreen(true), false, 'pedir de novo não faz nada');
    assert.equal(match.fullscreen(false), true);
    assert.equal(win.isFullScreen(), false);
  } finally {
    match.dispose();
  }
});

test('no mesmo monitor do jogo, a tela cheia espera você vir para o app (Alt+Tab)', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => false);
  try {
    match.fullscreen(true);
    assert.equal(win.isFullScreen(), false, 'não cobre o jogo nem tira o foco dele');
    assert.equal(win.waiting('focus'), true);
    win.emit('focus');
    assert.equal(win.isFullScreen(), true, 'Alt+Tab para o app: tela cheia');
  } finally {
    match.dispose();
  }
});

test('a partida acaba antes de você vir para o app: não entra em tela cheia depois', () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => false);
  try {
    match.fullscreen(true);
    match.fullscreen(false);
    assert.equal(win.waiting('focus'), false);
    win.emit('focus');
    assert.equal(win.isFullScreen(), false);
  } finally {
    match.dispose();
  }
});

test('já no app (com foco), entra em tela cheia na hora mesmo no monitor do jogo', () => {
  const win = fullscreenWindow({ focused: true });
  const match = new MatchWindow(() => win, () => AREA, () => false);
  try {
    match.fullscreen(true);
    assert.equal(win.isFullScreen(), true);
  } finally {
    match.dispose();
  }
});

test('2º monitor: restaura via showInactive e mantém tela cheia se Windows/DirectX minimizar durante o jogo', async () => {
  const win = fullscreenWindow();
  const logs = [];
  const match = new MatchWindow(() => win, () => AREA, () => true, (m) => logs.push(m));
  try {
    match.fullscreen(true);
    assert.equal(win.isFullScreen(), true);

    // Simula Windows/DirectX minimizando o app quando o LoL assume tela
    win.emit('minimize');
    assert.equal(win.isMinimized(), true);
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(win.showInactiveCalls >= 1, true, 'deve usar showInactive para não roubar foco do LoL');
    assert.equal(win.isMinimized(), false, 'janela deve sair de minimizada sozinha');
    assert.equal(win.isFullScreen(), true, 'deve permanecer em tela cheia no 2º monitor');
    assert.equal(win.isFocused(), false, 'nunca deve roubar foco do jogo');
    assert.ok(logs.some((m) => m.includes('restaurada em tela cheia no 2º monitor')));
  } finally {
    match.dispose();
  }
});

test('2º monitor: minimização explícita pelo usuário (Ctrl+Shift+R) não é desfeita', async () => {
  const win = fullscreenWindow({ focused: true });
  const match = new MatchWindow(() => win, () => AREA, () => true);
  try {
    match.fullscreen(true);
    match.allowMinimize();
    win.emit('minimize');
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(win.showInactiveCalls, 0);
    assert.equal(win.isMinimized(), true);
  } finally {
    match.dispose();
  }
});

test('2º monitor: janela já minimizada no GameStart volta via showInactive e entra em tela cheia', () => {
  const win = fullscreenWindow({ minimized: true });
  const match = new MatchWindow(() => win, () => AREA, () => true);
  try {
    assert.equal(match.fullscreen(true), true);
    assert.equal(win.showInactiveCalls, 1);
    assert.equal(win.isMinimized(), false);
    assert.equal(win.isFullScreen(), true);
    assert.equal(win.isFocused(), false);
  } finally {
    match.dispose();
  }
});

test('2º monitor: se Windows tirar tela cheia sem foco, reaplica; após fullscreen(false) guarda desarma', async () => {
  const win = fullscreenWindow();
  const match = new MatchWindow(() => win, () => AREA, () => true);
  try {
    match.fullscreen(true);
    assert.equal(win.isFullScreen(), true);

    win.emit('leave-full-screen');
    assert.equal(win.isFullScreen(), false);
    await new Promise((r) => setTimeout(r, 180));
    assert.equal(win.isFullScreen(), true, 'deve reaplicar tela cheia se caiu sem foco');

    match.fullscreen(false);
    assert.equal(win.isFullScreen(), false);
    await new Promise((r) => setTimeout(r, 180));
    assert.equal(win.isFullScreen(), false, 'guarda desarmada após fim de partida/Esc');
  } finally {
    match.dispose();
  }
});
