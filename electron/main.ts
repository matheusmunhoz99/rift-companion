import { app, BrowserWindow, ipcMain, shell, type Tray } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { AutoRunes } from './lcu/auto-runes';
import { registerChampSelectHandlers } from './lcu/champ-select-ipc';
import { LcuConnector } from './lcu/connector';
import { registerLobbyHandlers } from './lcu/lobby-ipc';
import { readGameWindowMode } from './overlay/game-settings';
import { OVERLAY_SHORTCUT, OverlayController } from './overlay/overlay';
import { registerRiotHandlers } from './riot/ipc';
import { Settings, type Preferences } from './settings';
import { createTray } from './tray';

const rendererUrl = process.env.RENDERER_URL;
const RENDERER_INDEX = path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser', 'index.html');
const BACKGROUND = '#0b0d13';
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

const connector = new LcuConnector();
let mainWindow: BrowserWindow | null = null;
let overlay: OverlayController | null = null;
let settings: Settings | null = null;
let tray: Tray | null = null;
let quitting = false;

/** Só no desenvolvimento: estado fictício e captura de tela para revisar o visual. */
const devOnly = (name: string) => (app.isPackaged ? undefined : process.env[name]);

function loadRenderer(window: BrowserWindow, hash = ''): void {
  if (rendererUrl) void window.loadURL(`${rendererUrl}${hash ? `#${hash}` : ''}`);
  else void window.loadFile(RENDERER_INDEX, hash ? { hash } : undefined);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: BACKGROUND,
    title: 'Rift Companion',
    icon: ICON,
    // Barra de título própria; os botões de janela continuam nativos.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BACKGROUND, symbolColor: '#8b93a7', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer(mainWindow, devOnly('RIFT_VIEW') ? `view=${devOnly('RIFT_VIEW')}` : '');
  scheduleCapture(mainWindow);

  mainWindow.on('close', (event) => {
    if (quitting || !settings?.getPreferences().minimizeToTray || !tray) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // O overlay é uma janela à parte; fechar a principal encerra o app.
    app.quit();
  });
}

function scheduleCapture(window: BrowserWindow): void {
  const target = devOnly('RIFT_CAPTURE');
  if (!target) return;
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const image = await window.capturePage();
      writeFileSync(target, image.toPNG());
      app.quit();
    }, Number(devOnly('RIFT_CAPTURE_DELAY') ?? 4000));
  });
}

/** Só no desenvolvimento: abre o overlay com dados de um arquivo e captura a janela. */
function captureDemoOverlay(dataFile: string): void {
  const window = new BrowserWindow({
    width: 640,
    height: 56,
    frame: false,
    transparent: true,
    show: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  loadRenderer(window, 'overlay');
  window.webContents.once('did-finish-load', () => {
    window.webContents.send('overlay:data', JSON.parse(readFileSync(dataFile, 'utf8')));
  });
  scheduleCapture(window);
}

function currentState() {
  const demo = devOnly('RIFT_DEMO_STATE');
  return demo ? JSON.parse(readFileSync(demo, 'utf8')) : connector.getState();
}

// Uma instância só: abrir de novo traz a janela existente para frente.
// A captura de desenvolvimento roda ao lado da instância normal.
const capturing = !!devOnly('RIFT_CAPTURE');
if (!capturing && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  ipcMain.handle('lcu:get-state', () => currentState());
  registerBuildHandlers(connector);
  registerChampSelectHandlers(connector);
  registerLobbyHandlers(connector);

  connector.on('state', () => {
    if (!devOnly('RIFT_DEMO_STATE')) mainWindow?.webContents.send('lcu:state', currentState());
  });

  app.whenReady().then(() => {
    // Settings usa app.getPath, que só fica disponível após o ready.
    const prefs = new Settings();
    settings = prefs;
    registerRiotHandlers(prefs, connector);
    applyStartWithWindows(prefs.getPreferences().startWithWindows);
    if (!app.isPackaged) connector.setSnapshotDirectory(path.join(app.getPath('userData'), 'debug'));

    new AutoAccept(
      connector,
      () => connector.getCredentials(),
      () => prefs.getAutoAccept(),
      () => mainWindow?.webContents.send('auto-accept:accepted', Date.now()),
    );

    new AutoRunes(
      connector,
      () => prefs.getPreferences().autoRunes,
      (result) => mainWindow?.webContents.send('auto-runes:applied', result),
    );

    if (!capturing) overlay = new OverlayController(
      connector,
      () => prefs.getPreferences(),
      (window) => loadRenderer(window, 'overlay'),
      path.join(__dirname, 'preload.js'),
    );

    ipcMain.handle('prefs:get', () => prefs.getPreferences());
    ipcMain.handle('prefs:set', (_event, changes: Partial<Preferences>) => {
      const preferences = prefs.updatePreferences(changes ?? {});
      overlay?.sync();
      applyStartWithWindows(preferences.startWithWindows);
      return preferences;
    });
    ipcMain.handle('app:game-window-mode', () =>
      readGameWindowMode(connector.getCredentials()?.installDirectory ?? null),
    );
    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      overlayShortcut: OVERLAY_SHORTCUT.replace('CommandOrControl', 'Ctrl'),
      buildsDirectory: path.join(app.getPath('userData'), 'builds'),
    }));
    ipcMain.handle('app:open-builds-folder', async () => {
      const directory = path.join(app.getPath('userData'), 'builds');
      await import('node:fs/promises').then((fs) => fs.mkdir(directory, { recursive: true }));
      await shell.openPath(directory);
    });

    const demoOverlay = devOnly('RIFT_DEMO_OVERLAY');
    if (demoOverlay) {
      captureDemoOverlay(demoOverlay);
      return;
    }

    createWindow();
    connector.start();
    tray = createTray(ICON, {
      show: showMainWindow,
      quit: () => {
        quitting = true;
        app.quit();
      },
      isAutoAccept: () => prefs.getAutoAccept(),
      setAutoAccept: (enabled) => {
        prefs.updatePreferences({ autoAccept: enabled });
        mainWindow?.webContents.send('prefs:changed', prefs.getPreferences());
      },
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => overlay?.dispose());

  app.on('window-all-closed', () => {
    connector.stop();
    if (process.platform !== 'darwin') app.quit();
  });
}

function showMainWindow(): void {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** No .exe portátil, o caminho estável é o do arquivo original, não o da pasta temporária. */
function applyStartWithWindows(enabled: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
  });
}
