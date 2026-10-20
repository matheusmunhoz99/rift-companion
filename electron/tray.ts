import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import type { InvisibleStartupStatus, InvisibleStatus, Preferences } from './settings';

interface TrayActions {
  show: () => void;
  quit: () => void;
  getPreferences: () => Preferences;
  updatePreferences: (changes: Partial<Preferences>) => void;
  launchLeague: () => void;
}

export interface AppTray {
  tray: Tray;
  /** Atualiza menu e dica depois de mudar uma preferência por fora da bandeja. */
  refresh: () => void;
}

const STATUS_OPTIONS: Array<{ value: InvisibleStatus; label: string }> = [
  { value: 'offline', label: 'Offline' },
  { value: 'mobile', label: 'Celular' },
  { value: 'online', label: 'Online' },
];

const STARTUP_OPTIONS: Array<{ value: InvisibleStartupStatus; label: string }> = [
  { value: 'last', label: 'Lembrar o último' },
  ...STATUS_OPTIONS,
];

/** "offline", "no celular", "online" ou "desativado", para menu e dica. */
export function invisibleSummary(prefs: Preferences): string {
  if (!prefs.appearOffline) return 'desativado';
  return { offline: 'offline', mobile: 'no celular', online: 'online' }[prefs.invisibleStatus];
}

/** Ícone na bandeja: o app continua rodando (aceite automático, overlay) com a janela fechada. */
export function createTray(iconPath: string, actions: TrayActions): AppTray {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));

  const invisibleMenu = (prefs: Preferences): MenuItemConstructorOptions[] => [
    {
      label: 'Ativado',
      type: 'checkbox',
      checked: prefs.appearOffline,
      click: (item) => actions.updatePreferences({ appearOffline: item.checked }),
    },
    { type: 'separator' },
    // Como no Deceive, escolher um status também ativa o modo invisível.
    ...STATUS_OPTIONS.map(({ value, label }): MenuItemConstructorOptions => ({
      label,
      type: 'radio',
      checked: prefs.appearOffline && prefs.invisibleStatus === value,
      click: () => actions.updatePreferences({ appearOffline: true, invisibleStatus: value }),
    })),
    { type: 'separator' },
    {
      label: 'Ao abrir o LoL',
      submenu: STARTUP_OPTIONS.map(({ value, label }): MenuItemConstructorOptions => ({
        label,
        type: 'radio',
        checked: prefs.invisibleStartupStatus === value,
        click: () => actions.updatePreferences({ invisibleStartupStatus: value }),
      })),
    },
    {
      label: 'Chat de sala e seleção',
      type: 'checkbox',
      checked: prefs.invisibleLobbyChat,
      click: (item) => actions.updatePreferences({ invisibleLobbyChat: item.checked }),
    },
  ];

  const buildMenu = () => {
    const prefs = actions.getPreferences();
    return Menu.buildFromTemplate([
      { label: 'Abrir Rift Companion', click: actions.show },
      {
        label: prefs.appearOffline ? 'Abrir LoL invisível' : 'Abrir LoL',
        click: actions.launchLeague,
      },
      { type: 'separator' },
      { label: `Modo invisível: ${invisibleSummary(prefs)}`, submenu: invisibleMenu(prefs) },
      { type: 'separator' },
      {
        label: 'Aceitar partida automaticamente',
        type: 'checkbox',
        checked: prefs.autoAccept,
        click: (item) => actions.updatePreferences({ autoAccept: item.checked }),
      },
      { type: 'separator' },
      { label: 'Sair', click: actions.quit },
    ]);
  };

  const refresh = () => {
    const prefs = actions.getPreferences();
    tray.setToolTip(prefs.appearOffline ? `Rift Companion · invisível: ${invisibleSummary(prefs)}` : 'Rift Companion');
    tray.setContextMenu(buildMenu());
  };

  refresh();
  // Reconstrói o menu ao abrir, para os itens refletirem a configuração atual.
  tray.on('right-click', () => tray.setContextMenu(buildMenu()));
  tray.on('double-click', actions.show);
  tray.on('click', actions.show);
  return { tray, refresh };
}
