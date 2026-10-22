// Run: electron scripts/mobile-preview.cjs. No LCU, relay, or real credentials.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'rift-phone-preview-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width:390,height:844,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'mobile-preview-preload.cjs'),contextIsolation:false,nodeIntegration:false,sandbox:false} });
  win.webContents.on('console-message', (_e, _l, message) => { if (/ERROR|Error/.test(message)) console.error(message); });
  await win.loadFile(path.join(__dirname,'../renderer/dist/renderer/browser/index.html'), {hash:process.env.RIFT_PHONE_VIEW ? `view=${process.env.RIFT_PHONE_VIEW}` : ''});
  await new Promise(resolve => setTimeout(resolve,4000));
  const state = await win.webContents.executeJavaScript(`({title:document.querySelector('h1,h2')?.textContent, width:innerWidth, scroll:document.documentElement.scrollWidth, android:document.body.classList.contains('android-app'), errors:document.querySelector('.error')?.textContent})`);
  console.log(JSON.stringify(state));
  const png = await win.webContents.capturePage();
  const out = path.join(__dirname,`../release/android-${process.env.RIFT_PHONE_PREVIEW || 'unlinked'}-${process.env.RIFT_PHONE_VIEW || 'home'}.png`);
  fs.writeFileSync(out,png.toPNG()); console.log(out); app.quit();
});
