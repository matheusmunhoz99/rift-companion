// Gera build/icon.png (512x512) a partir do logo SVG, usando o Electron:
//   npx electron scripts/render-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 512;
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="logo-edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffb35c" />
      <stop offset="1" stop-color="#e8455a" />
    </linearGradient>
    <linearGradient id="logo-core" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff7184" />
      <stop offset="1" stop-color="#c3233c" />
    </linearGradient>
  </defs>
  <path d="M16 1.8 28.3 8.9V23.1L16 30.2 3.7 23.1V8.9Z" fill="#141821" stroke="url(#logo-edge)" stroke-width="1.6" />
  <path d="M16 6.5 23 16 16 25.5 9 16Z" fill="url(#logo-core)" />
  <path d="M16.5 8.2 18.7 11.1" stroke="#ffd1d7" stroke-width="0.8" opacity="0.6" />
  <path d="M8.6 12.6 23.4 19.4" stroke="#141821" stroke-width="1.8" />
</svg>`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await window.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const output = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log(`Ícone salvo em ${output}`);
  app.quit();
});
