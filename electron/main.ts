import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { registerChampSelectHandlers } from './lcu/champ-select-ipc';
import { LcuConnector } from './lcu/connector';
import { OVERLAY_SHORTCUT, OverlayController } from './overlay/overlay';
import { registerRiotHandlers } from './riot/ipc';
import { Settings, type Preferences } from './settings';

const rendererUrl = process.env.RENDERER_URL;
const RENDERER_INDEX = path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser', 'index.html');
const BACKGROUND = '#0a0c10';

const connector = new LcuConnector();
let mainWindow: BrowserWindow | null = null;
let overlay: OverlayController | null = null;

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
    // No .exe o ícone vem do próprio executável; no desenvolvimento, de build/icon.png.
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '..', 'build', 'icon.png') }),
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
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  ipcMain.handle('lcu:get-state', () => currentState());
  registerBuildHandlers(connector);
  registerChampSelectHandlers(connector);

  connector.on('state', () => {
    if (!devOnly('RIFT_DEMO_STATE')) mainWindow?.webContents.send('lcu:state', currentState());
  });

  app.whenReady().then(() => {
    // Settings usa app.getPath, que só fica disponível após o ready.
    const settings = new Settings();
    registerRiotHandlers(settings, connector);
    if (!app.isPackaged) connector.setSnapshotDirectory(path.join(app.getPath('userData'), 'debug'));

    new AutoAccept(
      connector,
      () => connector.getCredentials(),
      () => settings.getAutoAccept(),
      () => mainWindow?.webContents.send('auto-accept:accepted', Date.now()),
    );

    overlay = new OverlayController(
      connector,
      () => settings.getPreferences().overlayEnabled,
      (window) => loadRenderer(window, 'overlay'),
      path.join(__dirname, 'preload.js'),
    );

    ipcMain.handle('prefs:get', () => settings.getPreferences());
    ipcMain.handle('prefs:set', (_event, changes: Partial<Preferences>) => {
      const preferences = settings.updatePreferences(changes ?? {});
      overlay?.sync();
      return preferences;
    });
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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('will-quit', () => overlay?.dispose());

  app.on('window-all-closed', () => {
    connector.stop();
    if (process.platform !== 'darwin') app.quit();
  });
}
