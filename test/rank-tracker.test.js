const test = require('node:test');
const assert = require('node:assert/strict');
const { ladderValue, queueSnapshot, rankMove } = require('../dist-electron/lcu/rank-tracker.js');

test('ladderValue cresce com tier, divisão e PDL', () => {
  const ferroIV0 = ladderValue('IRON', 'IV', 0);
  const ouroII50 = ladderValue('GOLD', 'II', 50);
  const diamanteI90 = ladderValue('DIAMOND', 'I', 90);
  assert.ok(ferroIV0 < ouroII50 && ouroII50 < diamanteI90, 'ordem crescente');
  // Subir uma divisão (IV->III) vale +100.
  assert.equal(ladderValue('GOLD', 'III', 0) - ladderValue('GOLD', 'IV', 0), 100);
});

test('ladderValue soma o PDL direto no Mestre+', () => {
  assert.equal(ladderValue('MASTER', 'I', 300) - ladderValue('MASTER', 'I', 100), 200);
  assert.ok(ladderValue('MASTER', 'I', 50) > ladderValue('DIAMOND', 'I', 100), 'Mestre fica acima de Diamante I');
  assert.ok(ladderValue('CHALLENGER', 'I', 500) > ladderValue('MASTER', 'I', 100), 'mais PDL = mais alto no apex');
});

test('ladderValue é null para tier inválido', () => {
  assert.equal(ladderValue('UNRANKED', 'I', 0), null);
  assert.equal(ladderValue('', '', 0), null);
});

test('queueSnapshot lê a fila certa do queueMap', () => {
  const raw = {
    queueMap: {
      RANKED_SOLO_5x5: { tier: 'EMERALD', division: 'II', leaguePoints: 45, wins: 10, losses: 8 },
      RANKED_FLEX_SR: { tier: 'GOLD', division: 'I', leaguePoints: 80, wins: 3, losses: 2 },
    },
  };
  const solo = queueSnapshot(raw, 'solo');
  assert.equal(solo.tier, 'EMERALD');
  assert.equal(solo.lp, 45);
  assert.equal(solo.games, 18);
  assert.equal(queueSnapshot(raw, 'flex').tier, 'GOLD');
});

test('queueSnapshot é null quando a fila está sem elo', () => {
  assert.equal(queueSnapshot({ queueMap: { RANKED_SOLO_5x5: { tier: 'NONE' } } }, 'solo'), null);
  assert.equal(queueSnapshot({ queueMap: {} }, 'solo'), null);
  assert.equal(queueSnapshot(null, 'solo'), null);
});

test('rankMove detecta subida, queda e manutenção', () => {
  const snap = (tier, division) => ({ tier, division, ladder: 0, games: 0, lp: 0 });
  assert.equal(rankMove(snap('GOLD', 'IV'), snap('GOLD', 'III')), 'promo');
  assert.equal(rankMove(snap('GOLD', 'I'), snap('PLATINUM', 'IV')), 'promo');
  assert.equal(rankMove(snap('PLATINUM', 'IV'), snap('GOLD', 'I')), 'demote');
  assert.equal(rankMove(snap('GOLD', 'II'), snap('GOLD', 'II')), null);
});
