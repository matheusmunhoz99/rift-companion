// Quando o modo invisível precisa reiniciar o LoL: node --test (depois de npm run build:electron).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyChatRoute } = require('../dist-electron/lcu/riot-client.js');

const URL = 'http://127.0.0.1:39788';
const CHAT = 39787;
const riot = (CommandLine = null, ProcessId = 100) => [{ ProcessId, CommandLine }];
const route = (processes, connections = [], launched = null) => classifyChatRoute(processes, connections, URL, CHAT, launched);

test('sem Riot Client aberto, nada a reiniciar', () => {
  assert.equal(route([]), 'closed');
});

test('linha de comando visível decide: nosso proxy ou outro caminho', () => {
  const ours = `"C:/Riot Games/Riot Client/RiotClientServices.exe" --client-config-url=${URL} --launch-product=league_of_legends`;
  assert.equal(route(riot(ours)), 'proxied');
  assert.equal(route(riot('"RiotClientServices.exe" --launch-product=league_of_legends')), 'direct', 'aberto pelo atalho da Riot');
  assert.equal(route(riot('"RiotClientServices.exe" --client-config-url=http://127.0.0.1:50123')), 'direct', 'outro proxy (ex.: Deceive)');
  assert.equal(route(riot('"RiotClientServices.exe" --client-config-url=http://127.0.0.1:42240')), 'direct', 'porta de uma sessão antiga do app');
});

test('sem linha de comando (sem administrador), a conexão de chat decide', () => {
  assert.equal(route(riot(), [{ RemoteAddress: '127.0.0.1', RemotePort: CHAT }]), 'proxied');
  assert.equal(route(riot(), [{ RemoteAddress: '172.65.212.1', RemotePort: 5223 }]), 'direct');
});

test('Riot Client aberto por este app vale como no proxy, mesmo antes do chat conectar', () => {
  assert.equal(route(riot(null, 7), [], { pid: 7, url: URL }), 'proxied');
  assert.equal(route(riot(null, 8), [], { pid: 7, url: URL }), 'unknown', 'outro processo: ainda não dá para saber');
});

test('chat ainda conectando e nada conhecido: espera (não reinicia à toa)', () => {
  assert.equal(route(riot(), [{ RemoteAddress: '127.0.0.1', RemotePort: 51000 }]), 'unknown');
});
