import { app, BrowserWindow, dialog, shell } from 'electron';
import { ipcMain, mobileOverride } from './mobile/rpc';
import { AndroidLink } from './mobile/link';
import { appLog, startAppLog } from './app-log';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { AutoRunes } from './lcu/auto-runes';
import { registerChampSelectHandlers } from './lcu/champ-select-ipc';
import { LcuConnector } from './lcu/connector';
import { registerLobbyHandlers } from './lcu/lobby-ipc';
import { readGameWindowMode } from './overlay/game-settings';
import { OVERLAY_HEIGHT, OVERLAY_SHORTCUT, OVERLAY_WIDTH, OverlayController } from './overlay/overlay';
import { createTimingsSource } from './overlay/timings-source';
import { registerRiotHandlers } from './riot/ipc';
import { TelegramNotifications } from './notify/telegram';
import { Settings, type Preferences } from './settings';
import { createTray, invisibleSummary, type AppTray } from './tray';
import { removeOldVersions, Updater } from './updater';
import { compareVersions } from './version';
import { introduction, statusLine, type InvisibleState } from './invisible/buddy';
import { InvisibleModeProxy } from './invisible/proxy';
import {
  closeLeagueAndRiotClient, isRiotClientRunning, launchLeague, riotChatRoute, riotClientElevated, riotClientPids, RiotClientNotResponding, trustRiotClient,
  type LeagueLaunchResult,
} from './lcu/riot-client';
import { PostGameService } from './lcu/postgame';

const rendererUrl = process.env.RENDERER_URL;
const RENDERER_INDEX = path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser', 'index.html');
const BACKGROUND = '#0b0d13';
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
/** Uma saudação do contato e um aviso na bandeja por sessão, não a cada reconexão do chat. */
/** Fases em que reiniciar o app atrapalha o jogador (seleção e partida). */
const BUSY_PHASES = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);
/** Reiniciar o LoL aqui tira o jogador da fila ou da partida: o modo invisível espera. */
const INVISIBLE_WAIT_PHASES = new Set([...BUSY_PHASES, 'Matchmaking', 'ReadyCheck']);
/** Logo depois de abrir (ou do app reabrir), o chat do Riot Client ainda está conectando. */
const CHAT_ROUTE_PATIENCE_MS = 45_000;
/** Quando você mesmo clica em "Abrir LoL", não dá para esperar tanto. */
const USER_CHAT_ROUTE_PATIENCE_MS = 8_000;
const GREETING_INTERVAL_MS = 30 * 60 * 1000;

const connector = new LcuConnector();
let mainWindow: BrowserWindow | null = null;
let overlay: OverlayController | null = null;
let settings: Settings | null = null;
let appTray: AppTray | null = null;
let invisibleMode: InvisibleModeProxy | null = null;
let androidLink: AndroidLink | null = null;
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

  // Se o renderer crashar (ex.: GPU process do Chromium caiu), recarrega em vez de ficar preto.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      appLog(`renderer crash: ${details.reason} (${details.exitCode})`);
      mainWindow?.webContents.reload();
    }
  });

  mainWindow.on('unresponsive', () => appLog('janela principal parou de responder'));
  mainWindow.on('responsive', () => appLog('janela principal voltou a responder'));

  // Captura erros do console do renderer para diagnóstico.
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) appLog(`renderer[${level}]: ${message.slice(0, 500)}`);
  });

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
    height: OVERLAY_HEIGHT,
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

  // Registro: só quando muda a conexão com o cliente ou a fase do jogo.
  let logged = { status: '', phase: '' as string | null };
  connector.on('state', () => {
    if (!devOnly('RIFT_DEMO_STATE')) mainWindow?.webContents.send('lcu:state', currentState());
    const { status, gameflowPhase } = connector.getState();
    if (status !== logged.status || gameflowPhase !== logged.phase) {
      appLog(`cliente: ${status}, fase: ${gameflowPhase ?? '-'}`);
      logged = { status, phase: gameflowPhase };
    }
  });
  process.on('uncaughtExceptionMonitor', (error) => appLog(`erro não tratado: ${error.stack ?? error.message}`));
  app.on('child-process-gone', (_event, details) => {
    appLog(`processo do Chromium caiu: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
    // Com o processo de GPU reiniciado, a janela principal pode ficar preta até ser repintada.
    if (details.type === 'GPU') setTimeout(repaintMainWindow, 1_000);
  });

  app.whenReady().then(() => {
    startAppLog(app.getPath('userData'));
    appLog(`app aberto: versão ${app.getVersion()}${app.isPackaged ? '' : ' (desenvolvimento)'}`);
    const gpu = app.getGPUFeatureStatus();
    appLog(`gpu: rasterização=${gpu.rasterization} composição=${gpu.gpu_compositing}`);
    // Settings usa app.getPath, que só fica disponível após o ready.
    const prefs = new Settings();
    settings = prefs;
    const invisible = new InvisibleModeProxy(path.join(app.getPath('userData'), 'invisible'));
    invisibleMode = invisible;
    invisible.configure(invisibleState(prefs.getPreferences()));

    let onInvisibleEnabled = (): void => undefined;
    /** Toda mudança de preferência passa por aqui: proxy, overlay, bandeja e janela ficam em sincronia. */
    const applyPreferences = (changes: Partial<Preferences>): Preferences => {
      const wasInvisible = prefs.getPreferences().appearOffline;
      const preferences = prefs.updatePreferences(changes);
      if (!wasInvisible && preferences.appearOffline) setImmediate(() => onInvisibleEnabled());
      invisible.configure(invisibleState(preferences));
      if ('overlayEnabled' in changes) appLog(`overlay ${preferences.overlayEnabled ? 'ligado' : 'desligado'} pelo usuário`);
      // Fora do handler do IPC: criar/esconder a janela do overlay no meio da resposta ao renderer pode travar a pintura da janela principal.
      setTimeout(() => {
        try { overlay?.sync(); } catch (error) { appLog(`overlay.sync erro: ${error}`); }
      }, 50);
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
      appLog('chat do LoL conectado pelo proxy do modo invisível');
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

    const balloon = (title: string, content: string) => appTray?.tray.displayBalloon({ iconType: 'info', title, content });
    const showError = (title: string, error: unknown) => {
      appLog(`${title}: ${error instanceof Error ? error.message : String(error)}`);
      showMainWindow();
      void dialog.showMessageBox({
        type: 'error', title, message: error instanceof Error ? error.message : 'Tente novamente.',
      });
    };

    /** Para onde vai o chat do Riot Client aberto; 'unknown' vira espera até o chat conectar. */
    const chatRoute = async (configUrl: string, patienceMs: number) => {
      const deadline = Date.now() + patienceMs;
      for (;;) {
        if (invisible.hasActiveChat()) return 'proxied' as const;
        const route = await riotChatRoute(configUrl, invisible.chatPort());
        if (route !== 'unknown') return route;
        if (Date.now() >= deadline) return 'direct' as const;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    };

    // LoL aberto sem o modo invisível (pelo atalho da Riot, ou antes de ligar o modo):
    // fecha o LoL e o Riot Client e abre de novo pelo proxy. Nunca no meio da fila ou da partida.
    let invisibleRestartPending = false;
    let invisibleRestartDeclined = false;
    let invisibleRestart: Promise<'restarted' | 'waiting' | 'declined' | 'not-needed'> | null = null;
    const restartLeagueInvisible = (ask: boolean, patienceMs = CHAT_ROUTE_PATIENCE_MS) => {
      invisibleRestart ??= (async () => {
        if (capturing || !prefs.getPreferences().appearOffline) return 'not-needed' as const;
        const configUrl = await invisible.start();
        const route = await chatRoute(configUrl, patienceMs);
        if (route === 'proxied') trustRiotClient(configUrl, await riotClientPids());
        if (route !== 'direct' || !prefs.getPreferences().appearOffline) {
          invisibleRestartPending = false;
          return 'not-needed' as const;
        }
        const phase = connector.getState().gameflowPhase;
        if (phase && INVISIBLE_WAIT_PHASES.has(phase)) {
          if (!invisibleRestartPending) {
            invisibleRestartPending = true;
            appLog(`LoL aberto sem o modo invisível durante ${phase}: reinicia quando a partida acabar`);
            balloon('Modo invisível depois desta partida',
              'O LoL foi aberto sem o modo invisível. Quando a partida acabar, o Rift Companion reinicia o LoL invisível para você.');
          }
          return 'waiting' as const;
        }
        invisibleRestartPending = false;
        // Só o Riot Client aberto (sem o LoL): não há sala a perder, então nem pergunta.
        const elevated = await riotClientElevated();
        if (ask && connector.getState().status === 'connected') {
          showMainWindow();
          const options = {
            type: 'question' as const,
            title: 'Rift Companion',
            message: 'Para ficar invisível, o LoL precisa reiniciar.',
            detail: 'O LoL e o Riot Client foram abertos sem o modo invisível. O Rift Companion fecha os dois e abre ' +
              'de novo já invisível; é só esperar uns segundos. Se você estiver numa sala, vai sair dela.' +
              (elevated ? ' O Riot Client está aberto como administrador: o Windows vai pedir permissão para fechá-lo.' : ''),
            buttons: ['Reiniciar o LoL agora', 'Agora não'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          };
          const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
          if (response !== 0) {
            invisibleRestartDeclined = true;
            appLog('reinício para o modo invisível recusado');
            return 'declined' as const;
          }
        }
        appLog('reiniciando o LoL e o Riot Client pelo proxy do modo invisível');
        balloon('Reiniciando o LoL invisível', 'Fechando o LoL e o Riot Client e abrindo de novo pelo modo invisível…');
        await closeLeagueAndRiotClient(connector.getCredentials(), appLog);
        const result = await launchConfiguredLeague();
        if (result !== 'started' && result !== 'riot-client' && result !== 'already-open') {
          throw new Error('O Riot Client não abriu de novo. Tente "Abrir LoL" outra vez em alguns segundos.');
        }
        appLog(`LoL reaberto pelo proxy do modo invisível (${result})`);
        return 'restarted' as const;
      })().finally(() => { invisibleRestart = null; });
      return invisibleRestart;
    };

    /** "Abrir LoL" (tela inicial, bandeja, Telegram): se precisar, reinicia sozinho em vez de pedir para fechar. */
    const openLeague = (ask: boolean): Promise<LeagueLaunchResult> => openLeagueSteps(ask).then(
      (result) => {
        appLog(`Abrir LoL: ${result ?? 'Riot Client não encontrado'}`);
        return result;
      },
      (error: unknown) => {
        appLog(`Abrir LoL falhou: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      },
    );
    const openLeagueSteps = async (ask: boolean): Promise<LeagueLaunchResult> => {
      const result = await launchConfiguredLeague().catch((error: unknown) => {
        // Riot Client travado sem o LoL aberto: não há sala a perder, então reinicia os dois.
        if (!(error instanceof RiotClientNotResponding) || connector.getState().status === 'connected') throw error;
        appLog('o Riot Client não responde: fechando e abrindo de novo');
        return closeLeagueAndRiotClient(null, appLog).then(() => launchConfiguredLeague());
      });
      if (result !== 'restart-required') return result;
      invisibleRestartDeclined = false;
      // Pedido seu: não espera 45 s pelo chat; em poucos segundos já decide.
      const restart = await restartLeagueInvisible(ask, USER_CHAT_ROUTE_PATIENCE_MS);
      if (restart !== 'not-needed') return restart;
      // O Riot Client aberto já passa pelo proxy: falta só pedir para ele abrir o LoL.
      const retry = await launchConfiguredLeague();
      return retry === 'restart-required' ? 'already-open' : retry;
    };

    onInvisibleEnabled = () => {
      invisibleRestartDeclined = false;
      void restartLeagueInvisible(true).catch((error) => showError('Não foi possível reiniciar o LoL invisível', error));
    };

    // Cliente aberto por fora com o modo ligado, ou partida que acabou com o reinício pendente.
    let lastLcuStatus = connector.getState().status;
    connector.on('state', () => {
      const { status, gameflowPhase } = connector.getState();
      const opened = status === 'connected' && lastLcuStatus !== 'connected';
      lastLcuStatus = status;
      if (status !== 'connected') {
        invisibleRestartPending = false;
        return;
      }
      if (!prefs.getPreferences().appearOffline || invisibleRestartDeclined) return;
      const free = !gameflowPhase || !INVISIBLE_WAIT_PHASES.has(gameflowPhase);
      if (opened || (invisibleRestartPending && free)) {
        void restartLeagueInvisible(true).catch((error) => showError('Não foi possível reiniciar o LoL invisível', error));
      }
    });

    registerRiotHandlers(prefs, connector);

    // Fim de partida: placar completo do cliente, guardado para a tela "Partida ao vivo".
    const postGame = new PostGameService(connector, path.join(app.getPath('userData'), 'postgame'), devOnly('RIFT_DEMO_POSTGAME'));
    postGame.on('ready', (game) => mainWindow?.webContents.send('postgame:ready', game));
    ipcMain.handle('postgame:get', () => postGame.get());
    applyStartWithWindows(prefs.getPreferences().startWithWindows);
    // Última sessão de seleção (sem o token do chat), para entender modos novos da Riot.
    connector.setSnapshotDirectory(path.join(app.getPath('userData'), 'debug'));

    new AutoAccept(
      connector,
      () => connector.getCredentials(),
      () => prefs.getAutoAccept(),
      () => mainWindow?.webContents.send('auto-accept:accepted', Date.now()),
    );

    new TelegramNotifications(connector, prefs, () => openLeague(false));

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
      createTimingsSource(connector, app.isPackaged),
    );

    ipcMain.handle('prefs:get', () => prefs.getPreferences());
    ipcMain.handle('prefs:set', (_event, changes: Partial<Preferences>) => applyPreferences(changes ?? {}));
    const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status));
    ipcMain.handle('update:status', () => updater.getStatus());
    ipcMain.handle('update:check', () => updater.check());
    ipcMain.handle('update:install', () => {
      // Reiniciar o app derruba o chat do modo invisível; espera a partida acabar.
      const phase = connector.getState().gameflowPhase;
      if (phase && BUSY_PHASES.has(phase)) {
        throw new Error('Termine a partida antes de atualizar: o Rift Companion reinicia ao atualizar.');
      }
      appLog('atualização pedida pelo usuário');
      return updater.install();
    });
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
    ipcMain.handle('app:launch-league', () => openLeague(true));
    mobileOverride('app:launch-league', () => openLeague(false));
    if (!capturing) androidLink = new AndroidLink(connector);

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
        void openLeague(true).then(
          (result) => {
            if (result === null) {
              showMainWindow();
              void dialog.showMessageBox({
                type: 'info', title: 'Rift Companion',
                message: 'Não encontrei o Riot Client neste PC. Abra o LoL uma vez para registrar a instalação.',
              });
            }
          },
          (error) => showError('Não foi possível abrir o LoL', error),
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
    androidLink?.stop();
    appLog('app fechando');
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

/** Força a janela principal a desenhar de novo; se o renderer não responder, recarrega. */
function repaintMainWindow(): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  window.webContents.invalidate();
  const bounds = window.getBounds();
  if (!window.isMaximized() && !window.isFullScreen()) {
    window.setBounds({ ...bounds, width: bounds.width + 1 });
    window.setBounds(bounds);
  }
  void Promise.race([
    window.webContents.executeJavaScript('1').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]).then((alive) => {
    if (alive || window.isDestroyed()) return;
    appLog('janela principal sem resposta depois da queda: recarregando');
    window.webContents.reload();
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
