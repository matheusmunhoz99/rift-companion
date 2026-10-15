// Remove pastas de saída antes de compilar, para não sobrar arquivo antigo: node scripts/clean.js <pasta>...
const fs = require('node:fs');

for (const directory of process.argv.slice(2)) {
  fs.rmSync(directory, { recursive: true, force: true });
}
