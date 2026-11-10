import { app, BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, screen, shell } from 'electron';
import { APP_SHORTCUT, AppShortcut } from './app-shortcut';
import { JUNGLE_HOTKEYS, JungleHotkeys } from './jungle-hotkeys';
import { VisionController } from './vision/controller';
import { setBorderless } from './lcu/window-mode';
import { ipcMain, mobileOverride } from './mobile/rpc';
import { AndroidLink } from './mobile/link';
import { appLog, onAppLog, startAppLog } from './app-log';
import { diagEvent, flushDiagnostics, startDiagnostics } from './diagnostics';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerBuildHandlers } from './builds/ipc';
import { AutoAccept } from './lcu/auto-accept';
import { AutoRunes } from './lcu/auto-runes';
import { registerChampSelectHandlers } from './lcu/champ-select-ipc';
import { LcuConnector } from './lcu/connector';
import { registerLobbyHandlers } from './lcu/lobby-ipc';
import { readGameWindowMode } from './overlay/game-settings';
import { createTimingsSource } from './overlay/timings-source';
import { ObjectiveAnnouncer } from './overlay/objective-announcer';
import { RIFT_API_URL, apiPost, registerRiotHandlers } from './riot/ipc';
import { TelegramNotifications } from './notify/telegram';
import { ErrorReporter } from './report';
import { MatchWindow } from './match-window';
import { WindowStateKeeper, fitsSomeDisplay, loadWindowState } from './window-state';
import { Settings, type Preferences } from './settings';
import { createTray, invisibleSummary, type AppTray } from './tray';
import { isStoreInstall, removeOldVersions, repointShortcuts, Updater } from './updater';
import { RiftUsers } from './riot/rift-users';
import { compareVersions } from './version';
import { introduction, statusLine, type InvisibleState } from './invisible/buddy';
import { InvisibleModeProxy } from './invisible/proxy';
import {
  closeLeagueAndRiotClient, isRiotClientRunning, launchLeague, riotChatRoute, riotClientElevated, riotClientPids, RiotClientNotResponding, trustRiotClient,
  type LeagueLaunchResult,
} from './lcu/riot-client';
import { PostGameService } from './lcu/postgame';
import { RankTracker } from './lcu/rank-tracker';

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
let settings: Settings | null = null;
let appTray: AppTray | null = null;
let invisibleMode: InvisibleModeProxy | null = null;
let androidLink: AndroidLink | null = null;
let appShortcut: AppShortcut | null = null;
let jungleHotkeys: JungleHotkeys | null = null;
let visionSync: () => void = () => undefined;
/** Campos da selva marcados (atalhos e leitura automática). */
let campTimers: Array<{ key: string; name: string; backAt: number }> = [];

const CAMP_NAMES: Record<string, string> = {
  'ally:blue': 'Azul',
  'ally:gromp': 'Grompe',
  'ally:wolves': 'Lobos',
  'ally:raptors': 'Acuâminas',
  'ally:red': 'Vermelho',
  'ally:krugs': 'Krugues',
  'enemy:blue': 'Azul inim.',
  'enemy:gromp': 'Grompe inim.',
  'enemy:wolves': 'Lobos inim.',
  'enemy:raptors': 'Acuâminas inim.',
  'enemy:red': 'Vermelho inim.',
  'enemy:krugs': 'Krugues inim.',
  'river:scuttle-top': 'Caranguejo topo',
  'river:scuttle-bot': 'Caranguejo bot',
};

function upsertCampTimer(key: string, backAt: number): void {
  const name = CAMP_NAMES[key] ?? key;
  const idx = campTimers.findIndex((c) => c.key === key);
  if (idx >= 0) {
    campTimers[idx] = { key, name, backAt };
  } else {
    campTimers = [...campTimers, { key, name, backAt }].slice(0, 20);
  }
}
let quitting = false;
/** O modo partida está mexendo na janela (não grava esse tamanho como o lugar escolhido). */
let matchManaging: () => boolean = () => false;

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
  // Abre no monitor e no lugar em que estava da última vez (se esse monitor ainda existir).
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const saved = capturing || devOnly('RIFT_SIZE') ? null : loadWindowState(stateFile);
  const place = saved && fitsSomeDisplay(saved, screen.getAllDisplays().map((d) => d.workArea)) ? saved : null;
  mainWindow = new BrowserWindow({
    ...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : { width, height }),
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
      // Prints de revisão: a janela escondida continua animando e carregando (sem pausa do Chromium).
      backgroundThrottling: !capturing,
    },
  });
  if (place?.maximized) mainWindow.maximize();
  if (!capturing) new WindowStateKeeper(stateFile, () => matchManaging()).attach(mainWindow);

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
    // Fechar a principal encerra o app.
    app.quit();
  });
}

/**
 * Roda na página dos prints: espera o app terminar de abrir (a tela de abertura sair) e
 * depois as <img> e as imagens de fundo, inclusive de ::before/::after (artes dos cards).
 */
const WAIT_FOR_IMAGES = `(async () => {
  const until = (check, ms) => new Promise((done) => {
    const start = Date.now();
    const tick = () => (check() || Date.now() - start > ms ? done() : setTimeout(tick, 100));
    tick();
  });
  await until(() => !document.getElementById('boot') && document.querySelector('app-shell'), 30000);
  await new Promise((done) => setTimeout(done, 1500));
  const urls = new Set();
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const image = getComputedStyle(el, pseudo).backgroundImage;
      for (const m of image.matchAll(/url\\("?([^")]+)"?\\)/g)) urls.add(m[1]);
    }
  }
  const load = (src) => new Promise((done) => { const i = new Image(); i.onload = i.onerror = done; i.src = src; });
  const pending = [...document.images].filter((img) => !img.complete)
    .map((img) => new Promise((done) => { img.onload = img.onerror = done; }));
  await Promise.race([
    Promise.all([...[...urls].map(load), ...pending]),
    new Promise((done) => setTimeout(done, 20000)),
  ]);
  await new Promise((done) => setTimeout(done, 400));
})()`;

function scheduleCapture(window: BrowserWindow): void {
  const target = devOnly('RIFT_CAPTURE');
  if (!target) return;
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      // Espera as imagens da tela (artes dos campeões, ícones) terminarem de carregar: um
      // print com o card sem arte não serve. No máximo 20 s; depois tira assim mesmo.
      await window.webContents.executeJavaScript(WAIT_FOR_IMAGES).catch(() => undefined);
      const image = await window.capturePage();
      writeFileSync(target, image.toPNG());
      app.quit();
    }, Number(devOnly('RIFT_CAPTURE_DELAY') ?? 4000));
  });
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
    // O estado da GPU só vale depois de 'gpu-info-update'; lido antes, sempre parece "software".
    app.once('gpu-info-update', () => {
      const gpu = app.getGPUFeatureStatus();
      appLog(`gpu: rasterização=${gpu.rasterization} composição=${gpu.gpu_compositing}`);
    });
    // Settings usa app.getPath, que só fica disponível após o ready.
    const prefs = new Settings();
    // Última conta do LoL neste PC: o perfil e o histórico funcionam com o cliente fechado.
    if (!capturing) connector.setAccountFile(path.join(app.getPath('userData'), 'account.json'));
    settings = prefs;
    const reporter = new ErrorReporter(prefs);
    reporter.install();
    // Erros do renderer chegam por IPC e passam pela mesma limpeza e envio.
    ipcMain.handle('app:report', (_event, context: unknown, message: unknown, stack: unknown) =>
      reporter.report(typeof context === 'string' ? context : 'renderer', buildError(message, stack)),
    );
    // Diagnóstico detalhado (opcional, desligado por padrão): ver electron/diagnostics.ts.
    startDiagnostics(
      {
        enabled: () => prefs.getPreferences().detailedDiagnostics,
        riotId: () => {
          const summoner = connector.getState().summoner;
          return summoner?.gameName ? `${summoner.gameName}#${summoner.tagLine}` : null;
        },
      },
      RIFT_API_URL,
    );
    onAppLog((line) => diagEvent('log', { detail: { linha: line.slice(0, 600) } }));
    ipcMain.handle('diag:event', (_event, kind: unknown, fields: unknown) => {
      if (typeof kind !== 'string' || !kind) return;
      const f = (fields && typeof fields === 'object' ? fields : {}) as Record<string, unknown>;
      diagEvent(kind, {
        gameId: typeof f.gameId === 'number' ? f.gameId : null,
        matchId: typeof f.matchId === 'string' ? f.matchId : null,
        status: typeof f.status === 'number' ? f.status : null,
        ms: typeof f.ms === 'number' ? f.ms : null,
        detail: f.detail ?? null,
      });
    });
    const invisible = new InvisibleModeProxy(path.join(app.getPath('userData'), 'invisible'));
    invisibleMode = invisible;
    invisible.configure(invisibleState(prefs.getPreferences()));

    let onInvisibleEnabled = (): void => undefined;
    /** Toda mudança de preferência passa por aqui: proxy, bandeja e janela ficam em sincronia. */
    const applyPreferences = (changes: Partial<Preferences>): Preferences => {
      const wasInvisible = prefs.getPreferences().appearOffline;
      const preferences = prefs.updatePreferences(changes);
      // Ligou: confere se o LoL aberto está invisível. Desligou: a faixa de aviso some.
      if (wasInvisible !== preferences.appearOffline) setImmediate(() => onInvisibleEnabled());
      invisible.configure(invisibleState(preferences));
      if ('showAsRiftUser' in changes) announceRiftUser();
      appShortcut?.apply(preferences.appShortcut && !capturing);
      jungleHotkeys?.sync();
      visionSync();
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
      for (; ;) {
        if (invisible.hasActiveChat()) return 'proxied' as const;
        const route = await riotChatRoute(configUrl, invisible.chatPort());
        if (route !== 'unknown') return route;
        if (Date.now() >= deadline) return 'direct' as const;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    };

    // LoL aberto sem o modo invisível (pelo atalho da Riot, ou antes de ligar o modo): o app só
    // avisa com uma faixa discreta na janela. Nada de pop-up e nada de fechar o LoL sozinho; quem
    // decide reiniciar é o jogador, no botão da faixa ou em "Abrir LoL invisível".
    // RIFT_DEMO_INVISIBLE_MISSING (só no desenvolvimento): mostra a faixa para conferir o visual.
    const demoInvisibleMissing = !!devOnly('RIFT_DEMO_INVISIBLE_MISSING');
    let invisibleMissing = demoInvisibleMissing;
    const setInvisibleMissing = (missing: boolean) => {
      if (demoInvisibleMissing || invisibleMissing === missing) return;
      invisibleMissing = missing;
      appLog(missing ? 'LoL aberto sem o modo invisível: faixa de aviso na janela' : 'modo invisível ok');
      mainWindow?.webContents.send('invisible:missing', missing);
    };
    let invisibleCheck: Promise<void> | null = null;
    /** Só verifica se o chat do LoL passa pelo modo invisível; não fecha nem reabre nada. */
    const checkInvisible = () => {
      invisibleCheck ??= (async () => {
        if (capturing || !prefs.getPreferences().appearOffline) return setInvisibleMissing(false);
        const configUrl = await invisible.start();
        const route = await chatRoute(configUrl, CHAT_ROUTE_PATIENCE_MS);
        if (route === 'proxied') trustRiotClient(configUrl, await riotClientPids());
        setInvisibleMissing(route === 'direct' && prefs.getPreferences().appearOffline && connector.getState().status === 'connected');
      })()
        .catch((error: unknown) => appLog(`checagem do modo invisível falhou: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { invisibleCheck = null; });
      return invisibleCheck;
    };
    ipcMain.handle('invisible:missing', () => invisibleMissing);
    ipcMain.handle('invisible:restart', async () => {
      const result = await restartLeagueInvisible(false, USER_CHAT_ROUTE_PATIENCE_MS);
      if (result === 'restarted' || result === 'not-needed') setInvisibleMissing(false);
      return result;
    });

    let invisibleRestart: Promise<'restarted' | 'waiting' | 'declined' | 'not-needed'> | null = null;
    const restartLeagueInvisible = (ask: boolean, patienceMs = CHAT_ROUTE_PATIENCE_MS) => {
      invisibleRestart ??= (async () => {
        if (capturing || !prefs.getPreferences().appearOffline) return 'not-needed' as const;
        const configUrl = await invisible.start();
        const route = await chatRoute(configUrl, patienceMs);
        if (route === 'proxied') trustRiotClient(configUrl, await riotClientPids());
        if (route !== 'direct' || !prefs.getPreferences().appearOffline) return 'not-needed' as const;
        // Fila, seleção ou partida: não fecha o LoL agora; a faixa continua e o jogador tenta depois.
        const phase = connector.getState().gameflowPhase;
        if (phase && INVISIBLE_WAIT_PHASES.has(phase)) return 'waiting' as const;
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
      // Pedido seu: não espera 45 s pelo chat; em poucos segundos já decide.
      const restart = await restartLeagueInvisible(ask, USER_CHAT_ROUTE_PATIENCE_MS);
      if (restart === 'restarted') setInvisibleMissing(false);
      if (restart !== 'not-needed') return restart;
      // O Riot Client aberto já passa pelo proxy: falta só pedir para ele abrir o LoL.
      const retry = await launchConfiguredLeague();
      return retry === 'restart-required' ? 'already-open' : retry;
    };

    // Ligou o modo com o LoL já aberto: só confere; se precisar reiniciar, a faixa avisa.
    // (checkInvisible com o modo desligado só tira a faixa.)
    onInvisibleEnabled = () => void checkInvisible();

    // Seleção de campeões começou: o app vem para a frente (uma vez por seleção).
    let lastFocusPhase = connector.getState().gameflowPhase;
    connector.on('state', () => {
      const phase = connector.getState().gameflowPhase;
      if (phase === lastFocusPhase) return;
      const entered = phase === 'ChampSelect' && lastFocusPhase !== 'ChampSelect';
      lastFocusPhase = phase;
      if (entered && !capturing && prefs.getPreferences().focusOnChampSelect) {
        bringToFront();
        appLog('seleção de campeões: app trazido para a frente');
      }
    });

    // Cliente aberto (por aqui ou pelo atalho da Riot) com o modo ligado: confere se está invisível.
    let lastLcuStatus = connector.getState().status;
    connector.on('state', () => {
      const { status } = connector.getState();
      const opened = status === 'connected' && lastLcuStatus !== 'connected';
      lastLcuStatus = status;
      if (status !== 'connected') return setInvisibleMissing(false);
      if (opened && prefs.getPreferences().appearOffline) void checkInvisible();
    });

    registerRiotHandlers(prefs, connector);

    // Ícone de quem usa o Rift Companion: avisa ao conectar (ou some, se a opção estiver
    // desligada) e responde à tela quais jogadores também usam.
    const riftUsers = new RiftUsers();
    function announceRiftUser(): void {
      const summoner = connector.getState().summoner;
      if (capturing || !summoner?.gameName || !summoner.tagLine) return;
      const visible = prefs.getPreferences().showAsRiftUser;
      void riftUsers.announce(`${summoner.gameName}#${summoner.tagLine}`, visible).catch(() => undefined);
    }
    connector.on('state', announceRiftUser);
    ipcMain.handle('users:lookup', (_event, riotIds: unknown) =>
      Array.isArray(riotIds) ? riftUsers.lookup(riotIds.filter((id): id is string => typeof id === 'string')) : []);

    // Fim de partida: placar completo do cliente, guardado para a tela "Partida ao vivo".
    const postGame = new PostGameService(connector, path.join(app.getPath('userData'), 'postgame'), devOnly('RIFT_DEMO_POSTGAME'));
    postGame.on('ready', (game) => mainWindow?.webContents.send('postgame:ready', game));
    ipcMain.handle('postgame:get', () => postGame.get());

    const rankTracker = new RankTracker(connector, postGame, path.join(app.getPath('userData'), 'rank'));
    rankTracker.on('updated', () => mainWindow?.webContents.send('rank:updated'));
    ipcMain.handle('rank:history', () => {
      const demo = devOnly('RIFT_DEMO_RANK');
      if (demo) return JSON.parse(readFileSync(demo, 'utf8'));
      const puuid = connector.getState().summoner?.puuid;
      return puuid ? rankTracker.history(puuid) : [];
    });
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
    connector.on('state', () => {
      const phase = connector.getState().gameflowPhase;
      if (phase !== 'InProgress' && phase !== 'Reconnect' && campTimers.length > 0) {
        campTimers = [];
      }
    });

    ipcMain.handle('app:set-borderless', async () => {
      const result = await setBorderless(connector.getCredentials(), connector.getState().gameflowPhase);
      appLog(`modo de janela do jogo: ${result}`);
      return result;
    });
    // Avisos de objetivos no chat do LoL (contato Rift Companion, precisa do modo invisível) e em voz alta.
    if (!capturing) new ObjectiveAnnouncer(
      connector,
      {
        chat: invisible,
        chatEnabled: () => prefs.getPreferences().chatObjectiveAlerts,
        speak: (text) => mainWindow?.webContents.send('voice:say', text),
        voiceEnabled: () => prefs.getPreferences().voiceAlerts,
      },
      createTimingsSource(connector, app.isPackaged),
    );
    // Ctrl+Shift+R: mostra e esconde o app de qualquer lugar (também por cima do jogo).
    appShortcut = new AppShortcut(toggleFromShortcut);
    appShortcut.apply(prefs.getPreferences().appShortcut && !capturing);
    // Visão da tela: o minimapa vai junto na leitura da IA; o gravador guarda amostras para calibrar.
    const visionTimings = createTimingsSource(connector, app.isPackaged);
    const vision = new VisionController(
      connector,
      path.join(app.getPath('userData'), 'vision-samples'),
      () => prefs.getPreferences(),
      // A IA do servidor lê o número de cada recorte ("1:57"); falha -> null (tenta no próximo quadro).
      (crops) => apiPost<{ results: Array<{ id: string; text: string | null }> }>('/v1/camp-ocr', { crops }).then((r) => r.results).catch(() => null),
      (key, backAt, exact) => {
        upsertCampTimer(key, backAt);
        mainWindow?.webContents.send('jungle:auto', { key, backAt, exact });
      },
      () => visionTimings(),
    );
    ipcMain.handle('vision:minimap', async () => {
      const capture = await vision.minimap();
      return capture ? { jpeg: capture.jpeg.toString('base64'), black: capture.black } : null;
    });
    ipcMain.handle('vision:status', () => vision.getStatus());
    ipcMain.handle('vision:open-samples', async () => {
      const folder = vision.folder();
      await import('node:fs/promises').then((fs) => fs.mkdir(folder, { recursive: true }));
      await shell.openPath(folder);
    });
    visionSync = () => vision.sync();
    // Ctrl+Alt+1..6 na partida: marca azul, vermelho e caranguejos sem sair do jogo.
    if (!capturing) jungleHotkeys = new JungleHotkeys(
      connector,
      () => prefs.getPreferences().jungleHotkeys,
      (camp) => mainWindow?.webContents.send('jungle:mark', camp),
    );
    // Card de compartilhar: copia ou salva como imagem um pedaço da janela.
    ipcMain.handle('app:capture-image', async (_event, rect: unknown, action: unknown, fileName: unknown) => {
      const win = mainWindow;
      if (!win || win.isDestroyed() || !isRect(rect)) return false;
      const image = await captureSharp(win, rect);
      if (image.isEmpty()) return false;
      if (action === 'copy') {
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })]);
        return true;
      }
      const name = typeof fileName === 'string' && fileName ? fileName.replace(/[<>:"/\|?*]+/g, '-') : 'rift-companion';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Salvar imagem',
        defaultPath: path.join(app.getPath('pictures'), `${name}.png`),
        filters: [{ name: 'Imagem PNG', extensions: ['png'] }],
      });
      if (canceled || !filePath) return false;
      writeFileSync(filePath, image.toPNG());
      appLog('card de fim de jogo salvo');
      return true;
    });

    ipcMain.handle('prefs:get', () => prefs.getPreferences());
    ipcMain.handle('prefs:set', (_event, changes: Partial<Preferences>) => applyPreferences(changes ?? {}));
    const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status));
    ipcMain.handle('update:status', () => updater.getStatus());
    ipcMain.handle('update:check', () => updater.check());
    ipcMain.handle('update:install', async () => {
      // Durante a seleção ou a partida: pergunta antes. O jogo não depende do app; com o modo
      // invisível o chat volta sozinho (o proxy reabre nas mesmas portas da sessão anterior).
      const phase = connector.getState().gameflowPhase;
      if (phase && BUSY_PHASES.has(phase)) {
        const inGame = phase !== 'ChampSelect';
        const options: Electron.MessageBoxOptions = {
          type: 'question',
          title: 'Atualizar agora?',
          message: inGame ? 'Atualizar durante a partida?' : 'Atualizar durante a seleção de campeões?',
          detail:
            'O Rift Companion fecha e abre de novo em uns 5 segundos, já na versão nova. ' +
            (inGame ? 'O jogo não é afetado e a partida ao vivo volta sozinha.' : 'A seleção continua normalmente no LoL.') +
            (invisibleMode?.hasActiveChat()
              ? '\n\nCom o modo invisível ligado, o chat do LoL pode cair por alguns segundos e volta sozinho.'
              : ''),
          buttons: ['Atualizar agora', 'Depois'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        };
        const { response } = mainWindow
          ? await dialog.showMessageBox(mainWindow, options)
          : await dialog.showMessageBox(options);
        if (response !== 0) {
          appLog(`atualização adiada pelo usuário (fase: ${phase})`);
          return false;
        }
        appLog(`atualização pedida pelo usuário durante ${phase}`);
      } else {
        appLog('atualização pedida pelo usuário');
      }
      await updater.install();
      return true;
    });
    if (!capturing) updater.start();
    // Versão nova aberta pela atualização: apaga o .exe antigo da mesma pasta.
    // (Na Store não há .exe solto nem atalho próprio: o Windows cuida de tudo.)
    if (app.isPackaged && !capturing && !isStoreInstall()) {
      // Antes de apagar o .exe antigo, o atalho da área de trabalho passa a abrir esta versão.
      const shortcuts = repointShortcuts();
      if (shortcuts.length) appLog(`atalhos atualizados para esta versão: ${shortcuts.length}`);
      void removeOldVersions().then((removed) => {
        if (removed.length) console.log('[updater] Versões antigas removidas:', removed.join(', '));
      });
    }

    ipcMain.handle('app:game-window-mode', () =>
      readGameWindowMode(connector.getCredentials()?.installDirectory ?? null),
    );
    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      appShortcut: APP_SHORTCUT.replace('CommandOrControl', 'Ctrl'),
      jungleHotkeys: JUNGLE_HOTKEYS.map((h) => ({ keys: h.accelerator.replace('Control', 'Ctrl'), label: h.label })),
      buildsDirectory: path.join(app.getPath('userData'), 'builds'),
      store: isStoreInstall(),
    }));
    // Na versão da Store, o "iniciar com o Windows" é a tarefa de inicialização do pacote,
    // ligada e desligada pela pessoa nas configurações do Windows.
    ipcMain.handle('app:open-startup-settings', () => shell.openExternal('ms-settings:startupapps'));
    ipcMain.handle('app:open-builds-folder', async () => {
      const directory = path.join(app.getPath('userData'), 'builds');
      await import('node:fs/promises').then((fs) => fs.mkdir(directory, { recursive: true }));
      await shell.openPath(directory);
    });
    ipcMain.handle('app:launch-league', () => openLeague(true));
    // Modo partida: a janela cresce na seleção, fica em tela cheia no carregamento e no jogo,
    // e volta ao tamanho de antes no fim de jogo. 'fullscreen' | true (aumentada) | false.
    const matchWindow = new MatchWindow(() => mainWindow);
    matchManaging = () => matchWindow.managing();
    ipcMain.handle('app:match-window', (_event, mode: unknown) => {
      // Prints de revisão (RIFT_CAPTURE) ficam sempre no tamanho pedido (RIFT_SIZE).
      if (capturing) return;
      const fullscreen = mode === 'fullscreen';
      if (matchWindow.fullscreen(fullscreen)) appLog(`modo partida: tela cheia ${fullscreen ? 'pedida' : 'desligada'}`);
      const changed = mode === true || fullscreen ? matchWindow.enter() : matchWindow.leave();
      if (changed) appLog(`modo partida: janela ${mode === false ? 'restaurada' : 'aumentada'}`);
    });
    mobileOverride('app:launch-league', () => openLeague(false));
    if (!capturing) androidLink = new AndroidLink(connector);


    createWindow();
    // A tela avisa quando a janela entra ou sai da tela cheia (o topo usa a largura toda; Esc sai).
    for (const [event, on] of [['enter-full-screen', true], ['leave-full-screen', false]] as const) {
      mainWindow?.on(event as 'enter-full-screen', () => mainWindow?.webContents.send('window:fullscreen', on));
    }
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
    void flushDiagnostics();
  });
  app.on('will-quit', () => {
    androidLink?.stop();
    appLog('app fechando');
    appShortcut?.dispose();
    jungleHotkeys?.dispose();
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

/**
 * Traz o app para a frente (seleção de campeões começou), mesmo minimizado ou na bandeja.
 * O Windows não deixa um app em segundo plano roubar o foco; "sempre no topo" por um
 * instante faz a janela aparecer na frente do cliente do LoL, no monitor em que ela está.
 */
/** Atalho global: com o app na frente, minimiza (volta para o jogo); senão, traz para a frente. */
function toggleFromShortcut(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
    mainWindow.minimize();
    return;
  }
  bringToFront();
}

/**
 * Recorta um pedaço da página em alta resolução (1080 px de largura no card), renderizado
 * de novo pelo Chromium em vez de ampliar o print da tela. Com o DevTools aberto o depurador
 * já está em uso: cai no print comum, no tamanho da tela.
 */
async function captureSharp(win: BrowserWindow, rect: { x: number; y: number; width: number; height: number }): Promise<Electron.NativeImage> {
  const scale = Math.max(1, Math.min(3, 1080 / rect.width));
  const debug = win.webContents.debugger;
  let attached = false;
  try {
    debug.attach('1.3');
    attached = true;
    const { data } = (await debug.sendCommand('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
    })) as { data: string };
    return nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
  } catch {
    return win.webContents.capturePage({
      x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
    });
  } finally {
    if (attached) debug.detach();
  }
}

function isRect(value: unknown): value is { x: number; y: number; width: number; height: number } {
  const r = value as Record<string, unknown> | null;
  return !!r && ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number))
    && (r.width as number) > 0 && (r.height as number) > 0;
}

function bringToFront(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
  }, 600);
}

/** No .exe portátil, o caminho estável é o do arquivo original, não o da pasta temporária. */
function applyStartWithWindows(enabled: boolean): void {
  // No pacote da Store a entrada no registro não vale: a inicialização é do Windows.
  if (!app.isPackaged || isStoreInstall()) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
  });
}

/** Recria um Error com o que o renderer mandou, para reusar a limpeza do reporter. */
function buildError(message: unknown, stack: unknown): Error {
  const error = new Error(typeof message === 'string' ? message : String(message));
  if (typeof stack === 'string') error.stack = stack;
  return error;
}