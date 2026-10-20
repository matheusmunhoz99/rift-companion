const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const util = require('node:util');

// Simula apenas SO/LCU: executa o módulo compilado real, sem abrir/fechar jogos.
function launcher(options = {}) {
  const filename = path.resolve(__dirname, '../dist-electron/lcu/riot-client.js');
  const localRequire = createRequire(filename);
  const events = { spawns: [], requests: 0, processQueries: 0 };
  const execFile = () => { throw new Error('Use promisify no launcher.'); };
  execFile[util.promisify.custom] = async (_exe, _args, settings) => {
    assert.equal(settings.windowsHide, true);
    events.processQueries++;
    if (options.queryError) throw new Error('CIM indisponível');
    return { stdout: JSON.stringify(options.processes ?? []), stderr: '' };
  };
  const childProcess = {
    execFile,
    spawn(exe, args, settings) {
      events.spawns.push({ exe, args, settings });
      const child = new EventEmitter();
      child.unref = () => undefined;
      queueMicrotask(() => options.spawnError ? child.emit('error', new Error('ENOENT')) : child.emit('spawn'));
      return child;
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, process: { platform: 'win32', env: { LOCALAPPDATA: 'C:/test-only' } },
    require(name) {
      if (name === 'node:child_process') return childProcess;
      if (name === 'node:fs') return {
        existsSync: file => file === 'C:/Riot/Live/RiotClientServices.exe',
        readFileSync(file) {
          if (String(file).endsWith('RiotClientInstalls.json')) {
            return JSON.stringify({ rc_default: 'C:/missing.exe', rc_live: 'C:/Riot/Live/RiotClientServices.exe' });
          }
          if (!options.lockfile) throw new Error('ENOENT');
          return options.lockfile;
        },
      };
      if (name === './http') return {
        ...localRequire('./http'),
        lcuRequest: async () => {
          events.requests++;
          if (options.apiError) throw new Error('LCU indisponível');
          return null;
        },
      };
      return localRequire(name);
    },
  });
  vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
  return { launch: module.exports.launchLeague, events };
}

const config = 'http://127.0.0.1:43123';
const processUsing = command => [{ ProcessId: 1234, CommandLine: command }];
const lockfile = 'Riot Client:1234:43124:synthetic-password:https';

test('cliente aberto sem proxy exige reinício mesmo quando falta lockfile', async () => {
  const h = launcher({ processes: processUsing('"C:/Riot/RiotClientServices.exe"') });
  assert.equal(await h.launch(config), 'restart-required');
  assert.equal(h.events.spawns.length, 0);
  assert.equal(h.events.requests, 0);
});

test('cliente já iniciado pelo proxy reabre LoL pela API sem exigir reinício', async () => {
  for (const arg of [`--client-config-url=${config}`, `--client-config-url="${config}"`]) {
    const h = launcher({ processes: processUsing('RiotClientServices.exe ' + arg), lockfile });
    assert.equal(await h.launch(config), 'riot-client');
    assert.equal(h.events.requests, 1);
    assert.equal(h.events.spawns.length, 0);
  }
});

test('linha de comando oculta pelo Windows conta como proxy só com chat ativo ou PID iniciado aqui', async () => {
  const hidden = processUsing(null);
  assert.equal(await launcher({ processes: hidden, lockfile }).launch(config), 'restart-required');
  const proxied = launcher({ processes: hidden, lockfile });
  assert.equal(await proxied.launch(config, true), 'riot-client');
  assert.equal(proxied.events.requests, 1);
});

test('abertura usa rc_live e sinaliza sucesso somente após spawn, com chamadas concorrentes unificadas', async () => {
  const h = launcher({ lockfile }); // lockfile antigo sem processo real não deve usar LCU
  const values = await Promise.all([h.launch(config), h.launch(config)]);
  assert.deepEqual(values, ['started', 'started']);
  assert.equal(h.events.spawns.length, 1);
  assert.equal(h.events.requests, 0);
  const spawned = h.events.spawns[0];
  assert.equal(spawned.exe, 'C:/Riot/Live/RiotClientServices.exe');
  assert.ok(spawned.args.includes(`--client-config-url=${config}`));
  assert.ok(spawned.args.includes('--allow-direct-launch'));
});

test('falhas de consulta, spawn ou LCU retornam erro em vez de anunciar modo invisível', async () => {
  for (const options of [
    { queryError: true },
    { spawnError: true },
    { processes: processUsing(`RiotClientServices.exe --client-config-url=${config}`), lockfile, apiError: true },
  ]) {
    const h = launcher(options);
    await assert.rejects(h.launch(config));
  }
  const h = launcher({ processes: processUsing(`RiotClientServices.exe --client-config-url=${config}0`) });
  assert.equal(await h.launch(config), 'restart-required', 'URL deve corresponder por inteiro');
});
