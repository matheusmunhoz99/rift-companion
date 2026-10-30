// Carrega um módulo TypeScript do renderer num teste do Node, transpilando na hora.
// Resolve imports relativos recursivamente (também transpilados) e remove os de tipo.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../renderer/node_modules/typescript');

const APP = path.join(__dirname, '..', '..', 'renderer', 'src', 'app');
const cache = new Map();

/** Carrega `relative` (sem extensão), relativo a renderer/src/app, e devolve seus exports. */
function loadTs(relative) {
  const file = path.join(APP, relative.endsWith('.ts') ? relative : `${relative}.ts`);
  if (cache.has(file)) return cache.get(file);

  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const module = { exports: {} };
  cache.set(file, module.exports);
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      return loadTs(path.relative(APP, path.resolve(path.dirname(file), request)));
    }
    return require(request);
  };
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

module.exports = { loadTs };
