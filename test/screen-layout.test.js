const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { mergeOrder, moveIn } = loadTs('core/layout-order');

const IDS = ['placar', 'desempenho', 'coach'];

test('ordem salva vale; sem nada salvo, a padrão', () => {
  assert.deepEqual(mergeOrder(null, IDS), IDS);
  assert.deepEqual(mergeOrder(['coach', 'placar', 'desempenho'], IDS), ['coach', 'placar', 'desempenho']);
});

test('seção que não existe mais sai; repetida e lixo são ignorados', () => {
  assert.deepEqual(mergeOrder(['velha', 'coach', 'coach', 3, 'placar', 'desempenho'], IDS), ['coach', 'placar', 'desempenho']);
});

test('seção nova (versão futura) entra depois da vizinha padrão, sem bagunçar a escolha', () => {
  // A pessoa pôs o coach no topo; a versão nova trouxe "timeline" depois de "desempenho".
  const ids = ['placar', 'desempenho', 'timeline', 'coach'];
  assert.deepEqual(mergeOrder(['coach', 'placar', 'desempenho'], ids), ['coach', 'placar', 'desempenho', 'timeline']);
  // Nova no começo da lista padrão: vai para o topo.
  assert.deepEqual(mergeOrder(['desempenho', 'placar'], ['resumo', 'placar', 'desempenho']), ['resumo', 'desempenho', 'placar']);
});

test('mover: sobe, desce e não passa dos limites', () => {
  assert.deepEqual(moveIn(IDS, 'coach', -1), ['placar', 'coach', 'desempenho']);
  assert.deepEqual(moveIn(IDS, 'placar', 1), ['desempenho', 'placar', 'coach']);
  assert.equal(moveIn(IDS, 'placar', -1), IDS, 'já é a primeira');
  assert.equal(moveIn(IDS, 'coach', 1), IDS, 'já é a última');
  assert.equal(moveIn(IDS, 'nada', 1), IDS);
});
