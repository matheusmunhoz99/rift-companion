import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { AutoRunes } from './lcu/auto-runes';
import { registerChampSelectHandlers } from './lcu/champ-select-ipc';
import { LcuConnector } from './lcu/connector';
import { registerLobbyHandlers } from './lcu/lobby-ipc';
import { readGameWindowMode } from './overlay/game-settings';
import { OVERLAY_SHORTCUT, OVERLAY_WIDTH, OverlayController } from './overlay/overlay';
import { registerRiotHandlers } from './riot/ipc';
import { TelegramNotifications } from './notify/telegram';
import { Settings, type Preferences } from './settings';
import { createTray, invisibleSummary, type AppTray } from './tray';
import { removeOldVersions, Updater } from './updater';
import { compareVersions } from './version';
import { introduction, statusLine, type InvisibleState } from './invisible/buddy';
import { InvisibleModeProxy } from './invisible/proxy';
import { isRiotClientRunning, launchLeague, type LeagueLaunchResult } from './lcu/riot-client';
import { PostGameService } from './lcu/postgame';

const rendererUrl = process.env.RENDERER_URL;
const RENDERER_INDEX = path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser', 'index.html');
const BACKGROUND = '#0b0d13';
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
/** Uma saudação do contato e um aviso na bandeja por sessão, não a cada reconexão do chat. */
const GREETING_INTERVAL_MS = 30 * 60 * 1000;

const connector = new LcuConnector();
let mainWindow: BrowserWindow | null = null;
let overlay: OverlayController | null = null;
let settings: Settings | null = null;
let appTray: AppTray | null = null;
let invisibleMode: InvisibleModeProxy | null = null;
let quitting = false;

/**
 * Com o chat do LoL passando pelo proxy, fechar o app derruba o chat até o
 * Rift Companion abrir de novo. Pergunta antes; devolve true para fechar.
 */
function confirmQuitWithChat(keepLabel = 'Manter aberto'): boolean {
  if (!invisibleMode?.hasActiveChat()) return true;
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Rift Companion',
    message: 'O chat do LoL está passando pelo Rift Companion (modo invisível).',
    detail: 'Se você fechar agora, o chat do LoL fica sem conexão até abrir o Rift Companion de novo: ' +
      'ele reconecta sozinho, sem reiniciar o jogo.',
    buttons: [keepLabel, 'Fechar mesmo assim'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return choice === 1;
}

function invisibleState(preferences: Preferences): InvisibleState {
  return {
    enabled: preferences.appearOffline,
    status: preferences.invisibleStatus,
    lobbyChat: preferences.invisibleLobbyChat,
  };
}

/** Só no desenvolvimento: estado fictício e captura de tela para revisar o visual. */
const devOnly = (name: string) => (app.isPackaged ? undefined : process.env[name]);

function loadRenderer(window: BrowserWindow, hash = ''): void {
  if (rendererUrl) void window.loadURL(`${rendererUrl}${hash ? `#${hash}` : ''}`);
  else void window.loadFile(RENDERER_INDEX, hash ? { hash } : undefined);
}

function createWindow(): void {
  // Só no desenvolvimento: tamanho da janela para revisar o layout (ex.: RIFT_SIZE=760x560).
  const [width, height] = (devOnly('RIFT_SIZE') ?? '1320x840').split('x').map(Number);
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 760,
    minHeight: 560,
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

  loadRenderer(mainWindow, devOnly('RIFT_VIEW') ? `view=${devOnly('RIFT_VIEW')}${devOnly('RIFT_PLAYER') ? `&player=${encodeURIComponent(devOnly('RIFT_PLAYER')!)}` : ''}${devOnly('RIFT_HASH') ? `&${devOnly('RIFT_HASH')}` : ''}` : '');
  scheduleCapture(mainWindow);

  mainWindow.on('close', (event) => {
    if (quitting) return;
    if (settings?.getPreferences().minimizeToTray && appTray) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (!invisibleMode?.hasActiveChat()) return;
    event.preventDefault();
    if (confirmQuitWithChat(appTray ? 'Minimizar para a bandeja' : 'Manter aberto')) {
      quitting = true;
      app.quit();
    } else if (appTray) mainWindow?.hide();
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
    width: OVERLAY_WIDTH,
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
void acquireInstance().then((acquired) => {
  if (!acquired) {
    app.quit();
    return;
  }

  // Outra cópia foi aberta: se for uma versão mais nova, esta fecha e cede o lugar.
  app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
    const version = (additionalData as { version?: string } | null)?.version;
    if (version && compareVersions(version, app.getVersion()) > 0) {
      quitting = true;
      app.quit();
      return;
    }
    showMainWindow();
  });

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
    const invisible = new InvisibleModeProxy(path.join(app.getPath('userData'), 'invisible'));
    invisibleMode = invisible;
    invisible.configure(invisibleState(prefs.getPreferences()));

    /** Toda mudança de preferência passa por aqui: proxy, overlay, bandeja e janela ficam em sincronia. */
    const applyPreferences = (changes: Partial<Preferences>): Preferences => {
      const preferences = prefs.updatePreferences(changes);
      invisible.configure(invisibleState(preferences));
      overlay?.sync();
      applyStartWithWindows(preferences.startWithWindows);
      appTray?.refresh();
      mainWindow?.webContents.send('prefs:changed', preferences);
      return preferences;
    };

    // Pedidos feitos pelo chat do LoL ao contato Rift Companion.
    invisible.on('command', (changes) => {
      applyPreferences({
        ...(changes.enabled !== undefined && { appearOffline: changes.enabled }),
        ...(changes.status && { invisibleStatus: changes.status }),
        ...(changes.lobbyChat !== undefined && { invisibleLobbyChat: changes.lobbyChat }),
      });
    });
    // Reconexões do chat no meio da sessão não repetem aviso nem saudação.
    let lastGreeting = 0;
    invisible.on('buddy-ready', () => {
      if (Date.now() - lastGreeting < GREETING_INTERVAL_MS) return;
      lastGreeting = Date.now();
      setTimeout(() => {
        const state = invisible.getState();
        invisible.sendBuddyMessages(prefs.takeInvisibleIntro()
          ? introduction(state)
          : [`Rift Companion ativo. ${statusLine(state)} Mande "ajuda" para ver os comandos.`]);
      }, 5_000).unref();
    });
    let lastBalloon = 0;
    invisible.on('connected', () => {
      const preferences = prefs.getPreferences();
      if (!preferences.appearOffline || Date.now() - lastBalloon < GREETING_INTERVAL_MS) return;
      lastBalloon = Date.now();
      appTray?.tray.displayBalloon({
        iconType: 'info',
        title: `Modo invisível: ${invisibleSummary(preferences)}`,
        content: 'O Rift Companion está protegendo seu status. Clique com o botão direito no ícone para trocar.',
      });
    });

    // Riot Client que continuou aberto depois que o app fechou (ou travou): o proxy
    // volta nas mesmas portas e o chat do LoL reconecta sozinho.
    if (!capturing && invisible.hasSavedSession()) void isRiotClientRunning().then((running) => {
      if (running) invisible.start().catch((error) => console.warn('[invisible] Não foi possível retomar:', error));
    });

    let configuredLaunch: Promise<LeagueLaunchResult> | null = null;
    const launchConfiguredLeague = (): Promise<LeagueLaunchResult> => {
      configuredLaunch ??= (async () => {
        const current = prefs.getPreferences();
        // "Status ao abrir o LoL" vale para uma sessão nova, não para reabrir o LoL no mesmo Riot Client.
        const startup = current.invisibleStartupStatus;
        if (current.appearOffline && !invisible.hasActiveChat() && startup !== 'last' && startup !== current.invisibleStatus) {
          applyPreferences({ invisibleStatus: startup });
        }
        const configUrl = current.appearOffline ? await invisible.start() : undefined;
        // A preferência pode mudar enquanto DNS/certificado estão sendo preparados.
        invisible.configure(invisibleState(prefs.getPreferences()));
        return launchLeague(configUrl, invisible.hasActiveChat());
      })().finally(() => { configuredLaunch = null; });
      return configuredLaunch;
    };
    registerRiotHandlers(prefs, connector);

    // Fim de partida: placar completo do cliente, guardado para a tela "Partida ao vivo".
    const postGame = new PostGameService(connector, path.join(app.getPath('userData'), 'postgame'), devOnly('RIFT_DEMO_POSTGAME'));
    postGame.on('ready', (game) => mainWindow?.webContents.send('postgame:ready', game));
    ipcMain.handle('postgame:get', () => postGame.get());
    applyStartWithWindows(prefs.getPreferences().startWithWindows);
    if (!app.isPackaged) connector.setSnapshotDirectory(path.join(app.getPath('userData'), 'debug'));

    new AutoAccept(
      connector,
      () => connector.getCredentials(),
      () => prefs.getAutoAccept(),
      () => mainWindow?.webContents.send('auto-accept:accepted', Date.now()),
    );

    new TelegramNotifications(connector, prefs, launchConfiguredLeague);

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
    ipcMain.handle('prefs:set', (_event, changes: Partial<Preferences>) => applyPreferences(changes ?? {}));
    const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status));
    ipcMain.handle('update:status', () => updater.getStatus());
    ipcMain.handle('update:check', () => updater.check());
    ipcMain.handle('update:install', () => updater.install());
    if (!capturing) updater.start();
    // Versão nova aberta pela atualização: apaga o .exe antigo da mesma pasta.
    if (app.isPackaged && !capturing) {
      void removeOldVersions().then((removed) => {
        if (removed.length) console.log('[updater] Versões antigas removidas:', removed.join(', '));
      });
    }

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
    ipcMain.handle('app:launch-league', launchConfiguredLeague);

    const demoOverlay = devOnly('RIFT_DEMO_OVERLAY');
    if (demoOverlay) {
      captureDemoOverlay(demoOverlay);
      return;
    }

    createWindow();
    connector.start();
    appTray = createTray(ICON, {
      show: showMainWindow,
      quit: () => {
        if (!confirmQuitWithChat()) return;
        quitting = true;
        app.quit();
      },
      getPreferences: () => prefs.getPreferences(),
      updatePreferences: (changes) => void applyPreferences(changes),
      launchLeague: () => {
        void launchConfiguredLeague().then(
          (result) => {
            if (result === 'restart-required' || result === null) {
              showMainWindow();
              void dialog.showMessageBox({
                type: 'info', title: 'Rift Companion',
                message: result === 'restart-required'
                  ? 'Feche o Riot Client por completo e abra o LoL novamente pelo Rift Companion para entrar invisível.'
                  : 'Não encontrei o Riot Client neste PC. Abra o LoL uma vez para registrar a instalação.',
              });
            }
          },
          (error) => {
            showMainWindow();
            void dialog.showMessageBox({
              type: 'error', title: 'Não foi possível abrir o LoL',
              message: error instanceof Error ? error.message : 'Tente novamente.',
            });
          },
        );
      },
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => {
    overlay?.dispose();
    invisibleMode?.dispose();
  });

  app.on('window-all-closed', () => {
    connector.stop();
    if (process.platform !== 'darwin') app.quit();
  });
});

/**
 * Uma instância só. Se já houver uma aberta, envia a nossa versão: uma versão
 * mais antiga fecha sozinha e esperamos ela sair; a mesma ou mais nova continua.
 */
async function acquireInstance(): Promise<boolean> {
  if (capturing) return true;
  const data = { version: app.getVersion() };
  if (app.requestSingleInstanceLock(data)) return true;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (app.requestSingleInstanceLock(data)) return true;
  }
  return false;
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
