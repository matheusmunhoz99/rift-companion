const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toChampSelect } = require('../dist-electron/lcu/champ-select');

const ALL_OWNED = [1, 2, 3, 103, 64, 99, 222];

// Draft normal/ranqueada: há ação de escolha e a grade usa a lista de escolhíveis.
test('draft normal mostra a grade de escolher campeões', () => {
  const session = {
    localPlayerCellId: 1,
    myTeam: [{ cellId: 1, championId: 0, championPickIntent: 0, assignedPosition: 'jungle' }],
    actions: [[{ id: 7, actorCellId: 1, type: 'pick', isInProgress: true, completed: false }]],
  };
  const state = toChampSelect(session, ALL_OWNED);
  assert.equal(state.pickActionId, 7);
  assert.deepEqual(state.pickableChampionIds, ALL_OWNED);
  assert.equal(state.benchEnabled, false);
});

// ARAM: campeão sorteado + banco. Não há escolha livre, então a grade fica vazia
// e o jogador só troca pelo banco. Antes, a ação de pick do ARAM fazia o app
// mostrar todos os campeões como se fosse draft.
test('ARAM não oferece a grade de escolher, só o banco', () => {
  const session = {
    localPlayerCellId: 1,
    benchEnabled: true,
    benchChampions: [{ championId: 103 }, { championId: 64 }, { championId: 99 }],
    allowRerolling: true,
    rerollsRemaining: 2,
    myTeam: [{ cellId: 1, championId: 222, championPickIntent: 0, assignedPosition: '' }],
    // O cliente do ARAM ainda traz uma ação de "pick" para confirmar o sorteado.
    actions: [[{ id: 7, actorCellId: 1, type: 'pick', isInProgress: true, completed: false }]],
  };
  const state = toChampSelect(session, ALL_OWNED);
  assert.equal(state.pickActionId, null);
  assert.equal(state.banActionId, null);
  assert.deepEqual(state.pickableChampionIds, []);
  assert.equal(state.benchEnabled, true);
  assert.deepEqual(state.benchChampionIds, [103, 64, 99]);
  assert.equal(state.championId, 222);
  assert.equal(state.rerollsRemaining, 2);
});

// Banco inferido pela lista de ids (sem a flag benchEnabled).
test('banco inferido pelos ids também desativa a grade', () => {
  const session = {
    localPlayerCellId: 1,
    benchChampionIds: [103, 64],
    myTeam: [{ cellId: 1, championId: 222, championPickIntent: 0, assignedPosition: '' }],
    actions: [[{ id: 7, actorCellId: 1, type: 'pick', isInProgress: true, completed: false }]],
  };
  const state = toChampSelect(session, ALL_OWNED);
  assert.equal(state.benchEnabled, true);
  assert.equal(state.pickActionId, null);
  assert.deepEqual(state.pickableChampionIds, []);
});
