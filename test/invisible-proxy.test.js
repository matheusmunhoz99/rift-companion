const assert = require('node:assert/strict');
const { test } = require('node:test');
const tls = require('node:tls');
const dns = require('node:dns');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { InvisibleModeProxy, readResponseBytes } = require('../dist-electron/invisible/proxy');

const fixture = name => fs.readFile(path.join(__dirname, 'fixtures/invisible', name));
const stream = "<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams'>";
const presence = '<presence><games><league_of_legends><st>dnd</st></league_of_legends></games><show>dnd</show><status>ação 🎮</status></presence>';
const room = "<presence to='sala@conference.pvp.net'><status>ação 🎮</status></presence>";

async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Condição de transporte não foi observada a tempo.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function harness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rift-invisible-test-'));
  const [cert, key, pfx] = await Promise.all([
    fixture('localhost-cert.pem'), fixture('localhost-key.pem'), fixture('localhost.pfx'),
  ]);
  const originalHost = process.env.RIFT_OFFLINE_HOST;
  process.env.RIFT_OFFLINE_HOST = 'localhost';
  const requests = [];
  const sessions = [];
  const sockets = [];
  const proxies = [];
  const connect = tls.connect;
  const nativeFetch = global.fetch;
  const upstream = tls.createServer({ cert, key }, socket => {
    const session = { socket, received: Buffer.alloc(0), closed: false };
    sessions.push(session);
    sockets.push(socket);
    socket.on('error', () => undefined);
    socket.on('data', bytes => { session.received = Buffer.concat([session.received, bytes]); });
    socket.on('close', () => { session.closed = true; });
  });
  t.after(async () => {
    for (const proxy of proxies) proxy.dispose();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => upstream.close(resolve));
    if (originalHost === undefined) delete process.env.RIFT_OFFLINE_HOST;
    else process.env.RIFT_OFFLINE_HOST = originalHost;
    await fs.rm(directory, { recursive: true, force: true });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamPort = upstream.address().port;
  const state = {
    config: {
      'chat.host': 'localhost', 'chat.port': upstreamPort,
      'chat.affinity.enabled': false, 'chat.affinities': { br: 'localhost' },
    },
    configStatus: 200,
    failCertificate: false,
  };
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }]);
  t.mock.method(tls, 'connect', options => {
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.servername, 'localhost');
    return connect({ ...options, host: '127.0.0.1', ca: cert });
  });
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/localhost.pfx')) {
      if (state.failCertificate) throw new Error('Certificado indisponível no teste.');
      return new Response(pfx);
    }
    if (String(url).includes('/pas/v1/service/chat')) {
      return new Response(`x.${Buffer.from('{"affinity":"br"}').toString('base64url')}.y`);
    }
    if (String(url).startsWith('https://clientconfig.rpg.riotgames.com/')) {
      return new Response(typeof state.config === 'string' ? state.config : JSON.stringify(state.config), {
        status: state.configStatus, headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('Endpoint inesperado no teste.');
  });
  const makeProxy = () => {
    const proxy = new InvisibleModeProxy(directory);
    proxies.push(proxy);
    return proxy;
  };
  async function configure(proxy) {
    const url = await proxy.start();
    const response = await nativeFetch(url + '/api/v1/config/player', {
      headers: { authorization: 'Bearer synthetic-test-only', 'x-riot-entitlements-jwt': 'synthetic-entitlements' },
    });
    assert.equal(response.status, 200);
    return { url, config: await response.json() };
  }
  async function client(port) {
    const socket = connect({ host: '127.0.0.1', port, servername: 'localhost', ca: cert });
    sockets.push(socket);
    socket.on('error', () => undefined);
    await once(socket, 'secureConnect');
    return socket;
  }
  return { directory, requests, sessions, state, makeProxy, configure, client, nativeFetch };
}

test('proxy TLS real encaminha chat, filtra presença, alterna online e aceita reconexão', async t => {
  const h = await harness(t);
  const proxy = h.makeProxy();
  const [{ url, config }, duplicateUrl] = await Promise.all([h.configure(proxy), proxy.start()]);
  assert.equal(url, duplicateUrl, 'start concorrente reutiliza os mesmos servidores');
  assert.equal(config['chat.host'], 'localhost');
  assert.ok(!h.requests.some(r => r.url.includes('/pas/')), 'flag false não consulta PAS');
  const request = h.requests.find(r => r.url.includes('/api/v1/config/player'));
  assert.equal(request.options.headers.authorization, 'Bearer synthetic-test-only');
  assert.equal(request.options.headers['x-riot-entitlements-jwt'], 'synthetic-entitlements');

  const client = await h.client(config['chat.port']);
  await until(() => h.sessions.length === 1);
  const session = h.sessions[0];
  let returned = '';
  client.on('data', bytes => { returned += bytes.toString('utf8'); });
  client.write(stream + '<pre');
  await until(() => session.received.length === Buffer.byteLength(stream));
  client.write(presence.slice(4) + room);
  await until(() => session.received.toString().includes(room));
  const first = session.received.toString();
  assert.ok(first.includes('<show>offline</show>'));
  assert.ok(!first.includes('<show>dnd</show>'));
  assert.equal(first.split('ação 🎮').length - 1, 1, 'só a presença de sala conserva o status');
  session.socket.write('<message><body>resposta</body></message>');
  await until(() => returned.includes('resposta'));

  let before = session.received.length;
  proxy.configure({ enabled: false, status: 'offline', lobbyChat: true });
  await until(() => session.received.length > before);
  assert.equal(session.received.subarray(before).toString(), presence);
  before = session.received.length;
  proxy.configure({ enabled: true, status: 'offline', lobbyChat: true });
  await until(() => session.received.length > before);
  assert.ok(session.received.subarray(before).toString().includes('<show>offline</show>'));

  client.destroy();
  await until(() => session.closed);
  const second = await h.client(config['chat.port']);
  await until(() => h.sessions.length === 2);
  proxy.configure({ enabled: false, status: 'offline', lobbyChat: true });
  second.write(room);
  await until(() => h.sessions[1].received.length > 0);
  assert.equal(h.sessions[1].received.toString(), room, 'não reapresenta dados da conexão anterior');
  const pending = h.sessions[1].received.length;
  second.write('<presence><status>não pode vazar');
  second.end();
  await until(() => h.sessions[1].closed);
  assert.equal(h.sessions[1].received.length, pending);
});

test('app reaberto volta nas mesmas portas e o Riot Client reconecta sem buscar configuração', async t => {
  const h = await harness(t);
  const first = h.makeProxy();
  const { url, config } = await h.configure(first);
  first.dispose();
  // Mesmo diretório: como o app abrindo de novo com o Riot Client ainda aberto.
  const second = h.makeProxy();
  assert.equal(second.hasSavedSession(), true);
  assert.equal(await second.start(), url, 'mesma porta do clientconfig');
  const client = await h.client(config['chat.port']);
  await until(() => h.sessions.length === 1);
  client.write(stream + presence);
  await until(() => h.sessions[0].received.toString().includes('<show>offline</show>'));
});

test('contato Rift Companion entra no roster, recebe comandos e nada dele chega à Riot', async t => {
  const h = await harness(t);
  const proxy = h.makeProxy();
  const { config } = await h.configure(proxy);
  const commands = [];
  proxy.on('command', changes => commands.push(changes));
  let ready = 0;
  proxy.on('buddy-ready', () => { ready++; });
  const client = await h.client(config['chat.port']);
  await until(() => h.sessions.length === 1);
  const session = h.sessions[0];
  let returned = '';
  client.on('data', bytes => { returned += bytes.toString('utf8'); });

  client.write(stream + presence);
  await until(() => session.received.toString().includes('<show>offline</show>'));
  const roster = "<iq type='result' id='r1'><query xmlns='jabber:iq:riotgames:roster'><item jid='amigo@br1.pvp.net'/></query></iq>";
  session.socket.write(stream + roster.slice(0, 30));
  session.socket.write(roster.slice(30));
  await until(() => returned.includes("from='7f3c2a91-4b6e-4d1f-9c8a-5e2b7d0a6c13@eu1.pvp.net/RC-Rift'"));
  assert.equal(ready, 1);
  assert.match(returned, /<query xmlns='jabber:iq:riotgames:roster'><item jid='7f3c2a91[^']*@eu1\.pvp\.net'/);
  assert.match(returned, /<item jid='amigo@br1\.pvp\.net'\/>/, 'amigos reais continuam no roster');
  assert.match(returned, /Você: offline/);

  const before = session.received.length;
  client.write("<message to='7f3c2a91-4b6e-4d1f-9c8a-5e2b7d0a6c13@eu1.pvp.net' type='chat'><body>Online</body></message>");
  client.write("<message to='amigo@br1.pvp.net' type='chat'><body>oi</body></message>");
  await until(() => session.received.toString().includes('<body>oi</body>'));
  assert.ok(!session.received.subarray(before).toString().includes('7f3c2a91'), 'mensagem ao contato não vai à Riot');
  await until(() => commands.length === 1);
  assert.deepEqual(commands[0], { enabled: true, status: 'online' });

  const sent = returned.length;
  proxy.configure({ enabled: true, status: 'mobile', lobbyChat: true });
  await until(() => returned.length > sent && returned.slice(sent).includes('</message>'));
  assert.match(returned.slice(sent), /Você: no celular/);
  assert.match(returned.slice(sent), /<body>Você aparece no celular para os amigos\.<\/body>/);
  await until(() => session.received.toString().includes('<show>mobile</show>'));
});

test('clientconfig escolhe PAS só quando habilitado, conserva erros upstream e recusa JSON inválido', async t => {
  const h = await harness(t);
  h.state.config['chat.affinity.enabled'] = true;
  const proxy = h.makeProxy();
  const { url } = await h.configure(proxy);
  assert.ok(h.requests.some(r => r.url.includes('/pas/')));
  h.state.configStatus = 503;
  h.state.config = 'temporariamente indisponível';
  let response = await h.nativeFetch(url + '/api/v1/config');
  assert.equal(response.status, 503);
  assert.equal(await response.text(), h.state.config);
  h.state.configStatus = 200;
  h.state.config = 'null';
  response = await h.nativeFetch(url + '/api/v1/config');
  assert.equal(response.status, 502);
  response = await h.nativeFetch(url + '/api/v1/config', { method: 'POST' });
  assert.equal(response.status, 405);
});

test('certificado válido usa cache e dispose durante startup não deixa proxy ativo', async t => {
  const h = await harness(t);
  const first = h.makeProxy();
  await first.start();
  first.dispose();
  h.state.failCertificate = true;
  const count = h.requests.length;
  await h.makeProxy().start();
  assert.equal(h.requests.length, count, 'cache válido evita download');
  const third = h.makeProxy();
  const starting = third.start();
  third.dispose();
  await assert.rejects(starting);
  await assert.rejects(third.start(), /encerrado/);
});

test('respostas grandes são canceladas durante leitura, inclusive sem Content-Length', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(32)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readResponseBytes(response, 40), /grande demais/);
  assert.equal(cancelled, true);
  assert.deepEqual(await readResponseBytes(new Response('ação'), 10), Buffer.from('ação'));
  await assert.rejects(readResponseBytes(new Response('x', { headers: { 'content-length': '200' } }), 10));
});
