import { Menu, Tray, nativeImage } from 'electron';

interface TrayActions {
  show: () => void;
  quit: () => void;
  isAutoAccept: () => boolean;
  setAutoAccept: (enabled: boolean) => void;
}

/** Ícone na bandeja: o app continua rodando (aceite automático, overlay) com a janela fechada. */
export function createTray(iconPath: string, actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('Rift Companion');

  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Abrir Rift Companion', click: actions.show },
      { type: 'separator' },
      {
        label: 'Aceitar partida automaticamente',
        type: 'checkbox',
        checked: actions.isAutoAccept(),
        click: (item) => actions.setAutoAccept(item.checked),
      },
      { type: 'separator' },
      { label: 'Sair', click: actions.quit },
    ]);

  tray.setContextMenu(buildMenu());
  // Reconstrói o menu ao abrir, para o checkbox refletir a configuração atual.
  tray.on('right-click', () => tray.setContextMenu(buildMenu()));
  tray.on('double-click', actions.show);
  tray.on('click', actions.show);
  return tray;
}
