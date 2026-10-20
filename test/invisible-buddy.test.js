const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rewritePresence, PresenceStreamFilter } = require('../dist-electron/invisible/presence.js');
const { ServerStreamRelay } = require('../dist-electron/invisible/roster.js');
const { BUDDY_ID, buddyMessage, parseCommand, statusLine } = require('../dist-electron/invisible/buddy.js');

// Formato real observado no debug.log (base64 encurtado).
const riotPresence = "<presence id='presence_14'><show>chat</show><status>♥</status><games>" +
  '<keystone><st>chat</st><s.t>1</s.t><m>♥</m><s.p>keystone</s.p><pty/></keystone>' +
  '<league_of_legends><s.r>BR1</s.r><st>chat</st><s.t>2</s.t><m>♥</m><p>eyJmaWxhIjo0ODB9</p><pd>eyJwYXJ0eSI6MX0=</pd>' +
  '<s.p>league_of_legends</s.p><s.c>live</s.c><pty/></league_of_legends></games></presence>';
const stream = "<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams'>";

test('celular mantém só o LoL sem atividade e troca show/st por mobile', () => {
  const mobile = rewritePresence(riotPresence, 'mobile');
  assert.equal(mobile, "<presence id='presence_14'><games><league_of_legends><s.r>BR1</s.r><s.t>2</s.t>" +
    '<s.p>league_of_legends</s.p><s.c>live</s.c><pty/><st>mobile</st></league_of_legends></games><show>mobile</show></presence>');
  assert.equal(rewritePresence('<presence><games><keystone/></games></presence>', 'mobile'),
    '<presence><games></games><show>mobile</show></presence>');
  assert.equal(rewritePresence(riotPresence, 'online'), riotPresence);
  assert.equal(rewritePresence(riotPresence, 'offline'), "<presence id='presence_14'><games></games><show>offline</show></presence>");
});

test('chat de sala desligado retém presenças de sala só enquanto o status está oculto', () => {
  const room = "<presence to='sala@champ-select.pvp.net/eu'><show>chat</show></presence>";
  let status = 'offline';
  let lobbyChat = false;
  const filter = new PresenceStreamFilter(() => status, { lobbyChat: () => lobbyChat });
  assert.deepEqual(filter.push(Buffer.from(stream + room)).map(String), [stream]);
  lobbyChat = true;
  assert.deepEqual(filter.push(Buffer.from(room)).map(String), [room]);
  lobbyChat = false;
  status = 'online';
  assert.deepEqual(filter.push(Buffer.from(room)).map(String), [room]);
});

test('tudo que vai ao contato é retido; o texto vira comando e o resto passa', () => {
  const bodies = [];
  const filter = new PresenceStreamFilter(() => 'offline', { onBuddyMessage: body => bodies.push(body) });
  const toBuddy = `<message to='${BUDDY_ID}@eu1.pvp.net' type='chat'><body>  celular &amp; já </body></message>`;
  const history = `<iq type='get' id='h'><query xmlns='jabber:iq:riotgames:archive'><with>${BUDDY_ID}@eu1.pvp.net</with></query></iq>`;
  const normal = "<message to='amigo@br1.pvp.net'><body>oi</body></message>";
  assert.deepEqual(filter.push(Buffer.from(stream + toBuddy + history + normal)).map(String), [stream, normal]);
  assert.deepEqual(bodies, ['celular & já']);
});

test('comandos em português ou inglês, sem acentos e sem confundir prefixos', () => {
  assert.deepEqual(parseCommand('Desativar'), { kind: 'change', changes: { enabled: false } });
  assert.deepEqual(parseCommand('ativar!'), { kind: 'change', changes: { enabled: true } });
  assert.deepEqual(parseCommand('ficar OFFLINE'), { kind: 'change', changes: { enabled: true, status: 'offline' } });
  assert.deepEqual(parseCommand('modo móvel'), { kind: 'change', changes: { enabled: true, status: 'mobile' } });
  assert.deepEqual(parseCommand('online'), { kind: 'change', changes: { enabled: true, status: 'online' } });
  assert.deepEqual(parseCommand('sala'), { kind: 'toggle-lobby' });
  assert.deepEqual(parseCommand('status?'), { kind: 'status' });
  assert.deepEqual(parseCommand('oi'), { kind: 'help' });
  assert.equal(statusLine({ enabled: true, status: 'mobile', lobbyChat: true }), 'Você aparece no celular para os amigos.');
  assert.match(buddyMessage('<b> & "x"'), /<body>&#60;b&#62; &#38; &#34;x&#34;<\/body>/);
});

test('roster recebe o contato uma vez, inclusive vazio ou dividido, e pushes não', () => {
  let ready = 0;
  const relay = new ServerStreamRelay(() => { ready++; });
  const push = "<iq type='set' id='p'><query xmlns='jabber:iq:riotgames:roster'><item jid='a'/></query></iq>";
  assert.equal(Buffer.concat(relay.push(Buffer.from(stream + push))).toString(), stream + push);
  assert.equal(relay.ready, false);
  const empty = "<iq id='r' type=\"result\"><query xmlns=\"jabber:iq:riotgames:roster\"/></iq>";
  const bytes = Buffer.from(empty);
  const output = [...relay.push(bytes.subarray(0, 20)), ...relay.push(bytes.subarray(20))].join('');
  assert.match(output, /^<iq id='r' type="result"><query xmlns="jabber:iq:riotgames:roster"><item jid='7f3c2a91/);
  assert.match(output, /<\/item><\/query><\/iq>$/);
  assert.equal(relay.ready, true);
  const again = "<iq type='result' id='r2'><query xmlns='jabber:iq:riotgames:roster'></query></iq>";
  assert.equal(relay.push(Buffer.from(again)).join(''), again, 'só o primeiro roster');
  return new Promise(resolve => setImmediate(() => { assert.equal(ready, 1); resolve(); }));
});

test('fluxo do servidor fora do esperado passa cru, sem perder bytes, e desativa injeções', () => {
  const relay = new ServerStreamRelay();
  const first = relay.push(Buffer.from(stream + '<message><body>par'));
  const rest = relay.push(Buffer.from('cial</message>texto solto<iq/>'));
  const after = relay.push(Buffer.from('<qualquer coisa'));
  assert.equal(Buffer.concat([...first, ...rest, ...after]).toString(),
    stream + '<message><body>parcial</message>texto solto<iq/><qualquer coisa');
  assert.equal(relay.ready, false);
});
