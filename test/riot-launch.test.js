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
  execFile[util.promisify.custom] = async (exe, _args, settings) => {
    assert.equal(settings.windowsHide, true);
    if (options.exec) return options.exec(exe, _args, events);
    // Depois do spawn, o Riot Client "aparece" na lista de processos.
    if (exe === 'tasklist.exe') {
      return { stdout: events.spawns.length ? '"RiotClientServices.exe","4321","Console","1","50.000 K"\r\n' : '', stderr: '' };
    }
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
    setTimeout, clearTimeout,
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
        lcuRequest: async (_credentials, method, endpoint, body) => {
          events.requests++;
          if (options.lcu) return options.lcu(method, endpoint, body, events);
          if (options.apiError) throw new Error('LCU indisponível');
          return null;
        },
      };
      return localRequire(name);
    },
  });
  vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
  return { launch: module.exports.launchLeague, close: module.exports.closeLeagueAndRiotClient, events };
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

// Riot Client reaberto como administrador por uma atualização: sem API e com "Acesso negado" no taskkill.
function elevatedClient({ declineUac = false } = {}) {
  const calls = [];
  let alive = true;
  return {
    calls,
    exec(exe, args) {
      calls.push(exe === 'powershell.exe' ? args.at(-1) : exe);
      if (exe === 'tasklist.exe') {
        return { stdout: alive ? '"RiotClientServices.exe","95580","Console","1","24.544 K"\r\n' : '', stderr: '' };
      }
      if (exe === 'taskkill.exe') throw Object.assign(new Error('Acesso negado.'), { code: 1 });
      const command = args.at(-1);
      if (command.includes('ExecutablePath')) return { stdout: alive ? '1\r\n' : '0\r\n', stderr: '' };
      if (command.includes('-Verb RunAs')) {
        if (declineUac) throw new Error('A operação foi cancelada pelo usuário.');
        alive = false;
        return { stdout: '', stderr: '' };
      }
      throw new Error(`comando inesperado: ${command}`);
    },
  };
}

test('Riot Client como administrador é fechado pelo taskkill elevado (UAC)', async () => {
  const fake = elevatedClient();
  const h = launcher({ exec: (...a) => fake.exec(...a), lockfile, apiError: true });
  const logs = [];
  await h.close(null, (message) => logs.push(message));
  const elevated = fake.calls.filter((c) => c.includes('-Verb RunAs'));
  assert.equal(elevated.length, 1);
  assert.match(elevated[0], /taskkill\.exe -ArgumentList '\/F \/T .*\/IM "Riot Client\.exe"/);
  assert.equal(fake.calls.filter((c) => c === 'taskkill.exe').length, 1, 'não insiste no taskkill comum');
  assert.ok(logs.some((m) => m.includes('administrador')));
  assert.ok(logs.at(-1).includes('fechados'));
});

test('permissão do Windows recusada explica como seguir', async () => {
  const fake = elevatedClient({ declineUac: true });
  const h = launcher({ exec: (...a) => fake.exec(...a), lockfile, apiError: true });
  await assert.rejects(h.close(null), /administrador.*"Sim"/s);
});

const proxiedProcess = processUsing(`RiotClientServices.exe --client-config-url=${config}`);
const { LcuHttpError } = require('../dist-electron/lcu/http');
const httpError = (status) => new LcuHttpError(status, '/x', '');

test('Riot Client em segundo plano (serviços descarregados) abre o LoL pelos argumentos novos', async () => {
  const sent = [];
  const h = launcher({
    processes: proxiedProcess, lockfile,
    lcu(method, endpoint, body) {
      sent.push({ endpoint, body });
      if (endpoint.startsWith('/product-launcher/')) throw httpError(404);
      return null;
    },
  });
  assert.equal(await h.launch(config), 'riot-client');
  assert.equal(sent.at(-1).endpoint, '/riotclientapp/v1/new-args');
  assert.equal(JSON.stringify(sent.at(-1).body), JSON.stringify(['--launch-product=league_of_legends', '--launch-patchline=live']));
  assert.equal(h.events.spawns.length, 0);
});

test('LoL que acabou de fechar (ainda saindo) é reaberto quando termina de sair', async () => {
  let leagueAlive = 2; // aparece em duas consultas e depois sai
  let launches = 0;
  const h = launcher({
    processes: proxiedProcess, lockfile,
    exec(exe) {
      if (exe === 'tasklist.exe') {
        const league = leagueAlive-- > 0 ? '"LeagueClient.exe","113012","Console","1","900.000 K"\r\n' : '';
        return { stdout: '"RiotClientServices.exe","1234","Console","1","50.000 K"\r\n' + league, stderr: '' };
      }
      return { stdout: JSON.stringify(proxiedProcess), stderr: '' };
    },
    lcu(_method, endpoint) {
      if (endpoint.startsWith('/product-launcher/') && launches++ === 0) throw httpError(423);
      return null;
    },
  });
  assert.equal(await h.launch(config), 'riot-client');
  assert.equal(launches, 2);
});

test('LoL aberto de verdade (com a janela) continua "já aberto"', async () => {
  const h = launcher({
    processes: proxiedProcess, lockfile,
    exec(exe) {
      if (exe === 'tasklist.exe') return { stdout: '"LeagueClient.exe","1","C","1","1 K"\r\n"LeagueClientUx.exe","2","C","1","1 K"\r\n', stderr: '' };
      return { stdout: JSON.stringify(proxiedProcess), stderr: '' };
    },
    lcu(_method, endpoint) {
      if (endpoint.startsWith('/product-launcher/')) throw httpError(423);
      return null;
    },
  });
  assert.equal(await h.launch(config), 'already-open');
});

test('LoL termina de sair e o Riot Client já entrou em segundo plano: abre pelos argumentos novos', async () => {
  let leagueAlive = 1;
  const sent = [];
  const h = launcher({
    processes: proxiedProcess, lockfile,
    exec(exe) {
      if (exe === 'tasklist.exe') {
        const league = leagueAlive-- > 0 ? '"LeagueClient.exe","113012","Console","1","900.000 K"\r\n' : '';
        return { stdout: league, stderr: '' };
      }
      return { stdout: JSON.stringify(proxiedProcess), stderr: '' };
    },
    lcu(_method, endpoint) {
      sent.push(endpoint);
      if (endpoint.startsWith('/product-launcher/')) throw httpError(sent.length === 1 ? 423 : 404);
      return null;
    },
  });
  assert.equal(await h.launch(config), 'riot-client');
  assert.equal(sent.at(-1), '/riotclientapp/v1/new-args');
});
