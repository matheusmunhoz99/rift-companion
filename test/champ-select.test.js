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

// ARAM novo: começa sem campeão e oferece alguns para escolher; depois vem o banco.
test('ARAM novo oferece os campeões sorteados para escolher antes do banco', () => {
  const session = {
    localPlayerCellId: 3,
    benchEnabled: true,
    benchChampions: [],
    allowSubsetChampionPicks: true,
    myTeam: [
      { cellId: 3, championId: 0, championPickIntent: 0, assignedPosition: 'NONE', spell1Id: 7, spell2Id: 32, gameName: 'Eu' },
      { cellId: 4, championId: 0, championPickIntent: 0, assignedPosition: 'NONE', spell1Id: 4, spell2Id: 32, gameName: 'Amigo' },
    ],
    theirTeam: [{ cellId: 5, championId: 0, nameVisibilityType: 'HIDDEN' }],
    actions: [[
      { id: 3, actorCellId: 3, type: 'pick', isInProgress: true, completed: false },
      { id: 4, actorCellId: 4, type: 'pick', isInProgress: true, completed: false },
      { id: 5, actorCellId: 5, type: 'pick', isInProgress: true, completed: false },
    ]],
    timer: { phase: 'BAN_PICK', adjustedTimeLeftInPhase: 15000, internalNowInEpochMs: 1000 },
  };
  const state = toChampSelect(session, [223, 127, 799]);
  assert.equal(state.pickActionId, 3);
  assert.equal(state.subsetPicks, true);
  assert.deepEqual([...state.pickableChampionIds], [223, 127, 799]);
  assert.equal(state.timerEndsAt, 16000);
  assert.equal(state.team[1].acting, 'pick');
  assert.equal(state.team[1].name, 'Amigo');
  assert.equal(state.enemies[0].name, null);
});

// Draft: inimigos aparecem conforme confirmam; banimentos separados por time.
test('draft mostra os inimigos confirmados, quem está escolhendo e os banimentos', () => {
  const session = {
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: 0, championPickIntent: 64, assignedPosition: 'jungle' },
      { cellId: 1, championId: 103, championPickIntent: 0, assignedPosition: 'middle' },
    ],
    theirTeam: [
      { cellId: 5, championId: 238, assignedPosition: '' },
      { cellId: 6, championId: 0, assignedPosition: '' },
    ],
    actions: [
      [
        { id: 1, actorCellId: 0, type: 'ban', championId: 157, completed: true, isInProgress: false, isAllyAction: true },
        { id: 2, actorCellId: 5, type: 'ban', championId: 555, completed: true, isInProgress: false, isAllyAction: false },
      ],
      [
        { id: 3, actorCellId: 1, type: 'pick', championId: 103, completed: true, isInProgress: false, isAllyAction: true },
        { id: 4, actorCellId: 5, type: 'pick', championId: 238, completed: true, isInProgress: false, isAllyAction: false },
      ],
      [{ id: 5, actorCellId: 6, type: 'pick', championId: 0, completed: false, isInProgress: true, isAllyAction: false }],
    ],
  };
  const state = toChampSelect(session, []);
  assert.deepEqual([...state.bans.ally], [157]);
  assert.deepEqual([...state.bans.enemy], [555]);
  assert.equal(state.enemies[0].championId, 238);
  assert.equal(state.enemies[0].locked, true);
  assert.equal(state.enemies[1].acting, 'pick');
  assert.equal(state.team[0].hoverChampionId, 64);
  assert.equal(state.team[1].locked, true);
  assert.equal(state.pickActionId, null);
});
