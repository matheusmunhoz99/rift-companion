// Publica o APK da versão atual para a atualização automática do app Android:
//   RELEASE_NOTES="Nota" npm run release:android
// (compila com npm --prefix renderer run android:apk e depois roda este script).
// Envia o APK e depois o android.json (nessa ordem, para nenhum celular ver o
// manifesto antes do arquivo) e aponta o link fixo RiftCompanion.apk para ele.
// O APK é assinado com a chave de debug deste PC: compilar em outro PC gera uma
// assinatura diferente, e o Android recusa instalar por cima.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOST = process.env.RIFT_DEPLOY_HOST ?? 'root@216.22.5.64';
const REMOTE_DIR = '/var/www/rift-downloads';
const BASE_URL = 'https://rift-api.workscanner.com.br/downloads/';
const KEEP = 2;

const root = path.join(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'renderer', 'android', 'app', 'build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!versionCode || !versionName) throw new Error('Não encontrei versionCode/versionName no build.gradle.');

const apk = path.join(root, 'renderer', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apk)) throw new Error(`Não encontrei ${apk}. Rode npm --prefix renderer run android:apk antes.`);

const file = `RiftCompanion-Android-${versionName}.apk`;
const notes = process.env.RELEASE_NOTES ?? process.argv.slice(2).join(' ');
const manifest = { versionCode, versionName, url: BASE_URL + file, ...(notes ? { notes } : {}) };
const manifestPath = path.join(root, 'renderer', 'android', 'app', 'build', 'android.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const ssh = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('ssh', [...ssh, HOST, `mkdir -p ${REMOTE_DIR}`]);
run('scp', [...ssh, apk, `${HOST}:${REMOTE_DIR}/${file}.part`]);
run('scp', [...ssh, manifestPath, `${HOST}:${REMOTE_DIR}/android.json.part`]);
run('ssh', [...ssh, HOST,
  `cd ${REMOTE_DIR} && mv ${file}.part ${file} && mv android.json.part android.json && ` +
  `ln -sfn ${file} RiftCompanion.apk && chmod 644 ${file} android.json && ` +
  `ls -1t RiftCompanion-Android-*.apk | tail -n +${KEEP + 1} | xargs -r rm -f`]);

const size = fs.statSync(apk).size;
console.log(`Publicado ${file} (${(size / 1e6).toFixed(1)} MB, versionCode ${versionCode})`);
