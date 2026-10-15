import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { LcuConnector } from './lcu/connector';
import { registerRiotHandlers } from './riot/ipc';
import { Settings } from './settings';

const rendererUrl = process.env.RENDERER_URL;
const connector = new LcuConnector();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0e1015',
    title: 'Rift Companion',
    autoHideMenuBar: true,
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

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser', 'index.html'),
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('lcu:get-state', () => connector.getState());
registerBuildHandlers(connector);

connector.on('state', (state) => {
  mainWindow?.webContents.send('lcu:state', state);
});

app.whenReady().then(() => {
  // Settings usa app.getPath, que só fica disponível após o ready.
  const settings = new Settings();
  registerRiotHandlers(settings, connector);

  new AutoAccept(
    connector,
    () => connector.getCredentials(),
    () => settings.getAutoAccept(),
    () => mainWindow?.webContents.send('auto-accept:accepted', Date.now()),
  );
  ipcMain.handle('auto-accept:get', () => settings.getAutoAccept());
  ipcMain.handle('auto-accept:set', (_event, enabled: boolean) =>
    settings.setAutoAccept(enabled === true),
  );

  createWindow();
  connector.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  connector.stop();
  if (process.platform !== 'darwin') app.quit();
});
