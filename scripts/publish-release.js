// Publica o .exe da versão atual para a atualização automática do app:
//   RELEASE_NOTES="Nota 1; Nota 2" npm run release
// Envia o .exe e depois o latest.json (nessa ordem, para nenhum cliente ver o
// manifesto antes do arquivo) para a pasta servida em /downloads/ no servidor.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HOST = process.env.RIFT_DEPLOY_HOST ?? 'root@216.22.5.64';
const REMOTE_DIR = '/var/www/rift-downloads';
const KEEP = 2;

const root = path.join(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const file = `RiftCompanion-Beta-${version}.exe`;
const exe = path.join(root, 'release', file);
if (!fs.existsSync(exe)) throw new Error(`Não encontrei ${exe}. Rode npm run dist antes.`);

const data = fs.readFileSync(exe);
const manifest = {
  version,
  file,
  sha256: crypto.createHash('sha256').update(data).digest('hex'),
  size: data.length,
  // Notas em RELEASE_NOTES separadas por ";" (argumentos via npm passam pelo cmd do
  // Windows, que insere "^" de escape). Argumentos diretos (node scripts/...) também valem.
  notes: process.env.RELEASE_NOTES
    ? process.env.RELEASE_NOTES.split(';').map((note) => note.trim()).filter(Boolean)
    : process.argv.slice(2),
  publishedAt: new Date().toISOString(),
};
const manifestPath = path.join(root, 'release', 'latest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('ssh', ['-o', 'BatchMode=yes', HOST, `mkdir -p ${REMOTE_DIR}`]);
run('scp', ['-o', 'BatchMode=yes', exe, `${HOST}:${REMOTE_DIR}/${file}.part`]);
run('ssh', ['-o', 'BatchMode=yes', HOST, `mv ${REMOTE_DIR}/${file}.part ${REMOTE_DIR}/${file}`]);
run('scp', ['-o', 'BatchMode=yes', manifestPath, `${HOST}:${REMOTE_DIR}/latest.json.part`]);
// Publica o manifesto, aponta o link fixo de download (RiftCompanion.exe) para a
// versão nova e mantém só as últimas versões.
run('ssh', ['-o', 'BatchMode=yes', HOST,
  `cd ${REMOTE_DIR} && mv latest.json.part latest.json && ln -sfn ${file} RiftCompanion.exe && chmod 644 *.exe latest.json && ls -1t RiftCompanion-Beta-*.exe | tail -n +${KEEP + 1} | xargs -r rm -f`]);

console.log(`Publicado ${file} (${(manifest.size / 1e6).toFixed(1)} MB, sha256 ${manifest.sha256.slice(0, 12)}…)`);
