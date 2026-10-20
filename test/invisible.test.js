const assert = require('node:assert/strict');
const { test } = require('node:test');
const { patchClientConfig, parseClientConfig, usesChatAffinity, affinityFromJwt } = require('../dist-electron/invisible/config.js');
const { rewritePresence, PresenceStreamFilter } = require('../dist-electron/invisible/presence.js');
const { MAX_STANZA_BYTES } = require('../dist-electron/invisible/xmpp.js');

test('modo invisível remove jogos e status apenas da presença global', () => {
  const original = "<presence><games><league_of_legends><st>chat</st><p>fila</p></league_of_legends><keystone><st>chat</st></keystone></games><show>chat</show><status>jogando</status></presence>";
  const hidden = rewritePresence(original, 'offline');
  assert.match(hidden, /<games><\/games>/);
  assert.match(hidden, /<show>offline<\/show>/);
  assert.doesNotMatch(hidden, /league_of_legends|keystone|jogando/);

  const lobby = "<presence to='sala@conference.pvp.net'><show>chat</show></presence>";
  assert.equal(rewritePresence(lobby, 'offline'), lobby);
  assert.equal(rewritePresence(original, 'online'), original);
});

test('filtro junta presence dividida e não segura tráfego comum', () => {
  let seen = '';
  const filter = new PresenceStreamFilter(() => 'offline', { onPresence: (presence) => { seen = presence; } });
  assert.deepEqual(filter.push(Buffer.from('<auth>token</auth>')).map(String), ['<auth>token</auth>']);
  assert.deepEqual(filter.push(Buffer.from('<presence><games>')), []);
  const output = filter.push(Buffer.from('</games><show>chat</show></presence><iq/>')).join('');
  assert.match(output, /<show>offline<\/show>/);
  assert.match(output, /<iq\/>$/);
  assert.match(seen, /<show>chat<\/show>/);
  assert.deepEqual(filter.push(Buffer.from("<presence to='sala'/> ")).map(String), ["<presence to='sala'/>", ' ']);
  assert.equal(rewritePresence('<presence/>', 'offline'), '<presence><games></games><show>offline</show></presence>');
});

test('clientconfig aponta host e afinidades para o proxy e conserva destino real', () => {
  const config = {
    'chat.host': 'fallback.chat.riotgames.com',
    'chat.port': 5223,
    'chat.affinity.enabled': true,
    'chat.affinities': { br: 'br.chat.riotgames.com', na: 'na.chat.riotgames.com' },
  };
  const patched = patchClientConfig(config, 'local.example', 43123, 'br');
  assert.deepEqual(patched.target, { host: 'br.chat.riotgames.com', port: 5223 });
  const body = JSON.parse(patched.body);
  assert.equal(body['chat.host'], 'local.example');
  assert.equal(body['chat.port'], 43123);
  assert.deepEqual(body['chat.affinities'], { br: 'local.example', na: 'local.example' });
});

const globalPresence = '<presence><games><league_of_legends><st>dnd</st><p>partida secreta</p></league_of_legends></games><show>dnd</show><status>ação 🎮</status></presence>';
const roomPresence = "<presence to='sala@conference.pvp.net'><status>ação 🎮</status><show>chat</show></presence>";
const stream = "<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams'>";

function filterChunks(chunks, status = 'offline') {
  const filter = new PresenceStreamFilter(() => status);
  const output = chunks.flatMap(chunk => filter.push(chunk));
  filter.flush();
  return Buffer.concat(output);
}

test('todos os cortes de byte ocultam a presença global e preservam UTF-8 de mensagens/salas', () => {
  const message = "<message><body><![CDATA[<presence>texto, ação 🎮</presence>]]></body></message>";
  const input = Buffer.from(stream + globalPresence + roomPresence + message + '</stream:stream>');
  const expected = Buffer.from(stream + rewritePresence(globalPresence, 'offline') + roomPresence + message + '</stream:stream>');
  for (let cut = 1; cut < input.length; cut++) {
    assert.deepEqual(filterChunks([input.subarray(0, cut), input.subarray(cut)]), expected, `corte ${cut}`);
  }
  assert.deepEqual(filterChunks(Array.from(input, byte => Buffer.from([byte]))), expected);
  assert.deepEqual(filterChunks(Array.from(input, byte => Buffer.from([byte])), 'online'), input);
});

test('alternância usa a última presença global e preserva dnd ao voltar online', () => {
  let offline = true;
  const saved = [];
  const filter = new PresenceStreamFilter(() => (offline ? 'offline' : 'online'), { onPresence: p => saved.push(p) });
  filter.push(Buffer.from(globalPresence + roomPresence + "<presence type='subscribe'/>"));
  assert.deepEqual(saved, [globalPresence]);
  assert.equal(filter.replay().toString(), rewritePresence(globalPresence, 'offline'));
  offline = false;
  assert.equal(filter.replay().toString(), globalPresence);
  offline = true;
  filter.push(Buffer.from("<presence type='unavailable'/>"));
  assert.equal(filter.replay(), null, 'não ressuscita uma presença encerrada');
  filter.push(Buffer.from(globalPresence));
  filter.push(Buffer.from(stream));
  assert.equal(filter.replay(), null, 'novo stream descarta o cache da sessão anterior');
});

test('parser distingue atributos, namespaces, CDATA, comentários e elementos filhos', () => {
  const fixture = '<presence note="a > b"><!-- <show>chat</show> --><status><![CDATA[</presence><show>chat</show>]]></status><show/><show>chat</show><games/><x xmlns="urn:example"><status>extensão</status></x></presence>';
  const output = filterChunks(Array.from(Buffer.from(fixture), byte => Buffer.from([byte]))).toString();
  assert.ok(output.includes('<x xmlns="urn:example"><status>extensão</status></x>'));
  assert.ok(output.includes('note="a > b"'));
  assert.ok(output.includes('<!-- <show>chat</show> -->'));
  assert.equal(output.split('<show>offline</show>').length - 1, 1);
  assert.ok(!output.includes('<![CDATA['));
  const namespacedStream = "<s:stream xmlns:s='http://etherx.jabber.org/streams' xmlns:c='jabber:client'>";
  const prefixed = '<c:presence><c:show>chat</c:show><c:status>secreto</c:status></c:presence>';
  const filtered = filterChunks([Buffer.from(namespacedStream + prefixed)]).toString();
  assert.match(filtered, /<c:show>offline<\/c:show>/);
  assert.doesNotMatch(filtered, /secreto/);
  assert.equal(rewritePresence("<presence to='a&#64;b'><status>ação</status></presence>", 'offline'),
    "<presence to='a&#64;b'><status>ação</status></presence>");
});

test('autenticação, reinício SASL e várias stanzas passam sem esperar outra leitura', () => {
  const filter = new PresenceStreamFilter(() => 'offline');
  const auth = "<?xml version='1.0'?>" + stream + "<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl'>fixture</auth>";
  assert.equal(Buffer.concat(filter.push(Buffer.from(auth))).toString(), auth);
  const restart = "<?xml version='1.0'?>" + stream;
  assert.equal(Buffer.concat(filter.push(Buffer.from(restart))).toString(), restart);
  const message = '<iq id="1"/><message><body>Olá</body></message>';
  assert.equal(Buffer.concat(filter.push(Buffer.from(message))).toString(), message);
});

test('XML incompleto, inválido, profundo ou grande nunca é liberado sem filtro', () => {
  const incomplete = new PresenceStreamFilter(() => 'offline');
  assert.deepEqual(incomplete.push(Buffer.from('<pre')), []);
  assert.throws(() => incomplete.flush(), /incompleto/);
  for (const xml of [
    '<presence><show>chat</presence>',
    '<presence><show>&undefined;</show></presence>',
    '<!DOCTYPE presence [<!ENTITY x "teste">]><presence/>',
    '<presence>' + '<x>'.repeat(65),
    '<presence><status>' + 'x'.repeat(MAX_STANZA_BYTES),
  ]) assert.throws(() => new PresenceStreamFilter(() => 'offline').push(Buffer.from(xml)));
  const invalidUtf8 = Buffer.concat([Buffer.from('<presence><status>'), Buffer.from([0xc3]), Buffer.from('</status></presence>')]);
  assert.throws(() => new PresenceStreamFilter(() => 'offline').push(invalidUtf8));
});

test('o limite é por stanza e não rejeita um pacote com muitas mensagens completas', () => {
  const input = Buffer.from('<iq/>'.repeat(Math.ceil(MAX_STANZA_BYTES / 5) + 1));
  assert.deepEqual(filterChunks([input]), input);
});

test('afinidade desabilitada ou ausente conserva fallback, sem mutar a configuração', () => {
  const config = {
    'chat.host': 'fallback.example', 'chat.port': 5223,
    'chat.affinity.enabled': false, 'chat.affinities': { br: 'br.example' },
  };
  const saved = JSON.stringify(config);
  assert.equal(usesChatAffinity(config), false);
  assert.deepEqual(patchClientConfig(config, 'localhost', 5000, 'br').target, { host: 'fallback.example', port: 5223 });
  assert.equal(JSON.stringify(config), saved);
  config['chat.affinity.enabled'] = true;
  assert.equal(usesChatAffinity(config), true);
  for (const affinity of [null, 'missing', '__proto__']) {
    assert.equal(patchClientConfig(config, 'localhost', 5000, affinity).target.host, 'fallback.example');
  }
  assert.deepEqual(patchClientConfig({ unrelated: true }, 'localhost', 5000, null), {
    body: '{"unrelated":true}', target: null,
  });
  for (const body of ['null', '[]', 'true', 'invalid']) assert.throws(() => parseClientConfig(body));
  // Resposta parcial: aponta para o proxy, mas não define destino real.
  assert.deepEqual(patchClientConfig({ 'chat.host': 'host' }, 'localhost', 5000, null), {
    body: '{"chat.host":"localhost"}', target: null,
  });
  assert.deepEqual(patchClientConfig({ 'chat.affinities': { br: 'br.example' } }, 'localhost', 5000, 'br'), {
    body: '{"chat.affinities":{"br":"localhost"}}', target: null,
  });
});

test('afinidade é extraída do JWT retornado pelo PAS', () => {
  const payload = Buffer.from(JSON.stringify({ affinity: 'br' })).toString('base64url');
  assert.equal(affinityFromJwt(`x.${payload}.y`), 'br');
  assert.equal(affinityFromJwt('inválido'), null);
});
