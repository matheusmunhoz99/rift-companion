const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const diag = require('../dist-electron/diagnostics.js');

function fakeServer(statuses) {
  const batches = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      batches.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(statuses.shift() ?? 200);
      res.end('{}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, batches, url: `http://127.0.0.1:${server.address().port}` })));
}

test('diagnóstico: desligado não marca pedidos nem guarda nada; ligado manda o lote com Riot ID', async () => {
  const { server, batches, url } = await fakeServer([500]);
  let enabled = false;
  diag.startDiagnostics({ enabled: () => enabled, riotId: () => 'Andrômeda Black#black' }, url);

  diag.diagEvent('api', { status: 200 });
  assert.deepStrictEqual(diag.diagHeaders(), {}, 'sem cabeçalho com a opção desligada');
  await diag.flushDiagnostics();
  assert.strictEqual(batches.length, 0, 'nada enviado desligado');

  enabled = true;
  assert.match(diag.diagHeaders()['X-Rift-Diag'], /^[0-9a-f-]{36}$/);
  diag.diagEvent('partida', { gameId: 777, detail: { fila: 420 } });
  diag.diagEvent('falha', { gameId: 777, detail: { onde: 'grupos', erro: 'timeout' } });

  // 1º envio falha (500): os eventos voltam para a fila e vão no próximo.
  await diag.flushDiagnostics();
  await diag.flushDiagnostics();
  server.close();
  assert.strictEqual(batches.length, 2);
  const sent = batches[1].body;
  assert.strictEqual(batches[1].url, '/v1/diag');
  assert.strictEqual(sent.riotId, 'Andrômeda Black#black');
  assert.deepStrictEqual(sent.events.map((e) => e.kind), ['sessao', 'partida', 'falha']);
  assert.strictEqual(sent.events[1].gameId, 777);
  assert.strictEqual(sent.session, diag.diagHeaders()['X-Rift-Diag'], 'mesma sessão do cabeçalho');
});

test('diagnóstico: caminho sem PUUID inteiro e com nome legível', () => {
  const puuid = 'x'.repeat(78);
  assert.strictEqual(diag.diagPath(`/v1/matches/BR1/${puuid}`), '/v1/matches/BR1/xxxxxxxx…');
  assert.strictEqual(diag.diagPath('/v1/live/BR1/Andr%C3%B4meda%20Black/black'), '/v1/live/BR1/Andrômeda Black/black');
});
