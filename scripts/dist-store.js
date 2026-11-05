// Gera o pacote MSIX da Microsoft Store: node scripts/dist-store.js (ou npm run dist:store).
// Usa o makeappx/makepri do Windows SDK instalado: o pacote de ferramentas que o
// electron-builder baixa traz links simbólicos do macOS que o Windows só extrai com o
// Modo Desenvolvedor, e aí o empacotamento falha.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SDK_BIN = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';

function newestSdkBin() {
  if (process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH) return process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH;
  const versions = fs.existsSync(SDK_BIN)
    ? fs.readdirSync(SDK_BIN).filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of versions.reverse()) {
    const dir = path.join(SDK_BIN, version, 'x64');
    if (fs.existsSync(path.join(dir, 'makeappx.exe')) && fs.existsSync(path.join(dir, 'makepri.exe'))) return dir;
  }
  throw new Error('Windows SDK não encontrado. Instale o "Windows SDK" (makeappx e makepri) e rode de novo.');
}

const kit = newestSdkBin();
console.log(`[store] ferramentas do Windows SDK: ${kit}`);
const root = path.join(__dirname, '..');
const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
execFileSync(bin, ['--win', 'appx', '--x64'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ELECTRON_BUILDER_WINDOWS_KITS_PATH: kit },
});
