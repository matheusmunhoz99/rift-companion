// Gera build/icon.png (512x512) a partir do logo SVG, usando o Electron:
//   npx electron scripts/render-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 512;
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6a7c"/>
      <stop offset="1" stop-color="#d9324a"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="url(#g)"/>
  <path d="M10 23V9h7a4.5 4.5 0 0 1 0 9h-7m6 0 6 5" fill="none" stroke="#fff" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/>
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
