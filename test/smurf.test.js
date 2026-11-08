const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');

const { smurfHint } = loadTs('live/smurf');

const solo = (tier, rank = 'II') => [{ queueType: 'RANKED_SOLO_5x5', tier, rank, leaguePoints: 40, wins: 30, losses: 20 }];

test('provável smurf: nível baixo com elo alto', () => {
  assert.match(smurfHint(50, solo('EMERALD')), /^Nível 50 e já /);
  assert.ok(smurfHint(58, solo('PLATINUM')));
  assert.ok(smurfHint(35, solo('GOLD')));
  assert.ok(smurfHint(90, solo('DIAMOND')));
  assert.ok(smurfHint(70, solo('MASTER', 'I')));
});

test('provável smurf: conta comum não é marcada', () => {
  assert.equal(smurfHint(61, solo('PLATINUM')), null, 'Platina no nível 61 já é normal');
  assert.equal(smurfHint(45, solo('GOLD')), null);
  assert.equal(smurfHint(50, solo('SILVER')), null, 'elo baixo não é sinal');
  assert.equal(smurfHint(150, solo('DIAMOND')), null);
  assert.equal(smurfHint(50, []), null, 'sem elo, sem sinal');
  assert.equal(smurfHint(null, solo('DIAMOND')), null, 'sem nível (servidor antigo), sem sinal');
});

test('provável smurf: usa a Flex quando não há Solo/Duo', () => {
  const flex = [{ queueType: 'RANKED_FLEX_SR', tier: 'EMERALD', rank: 'IV', leaguePoints: 0, wins: 10, losses: 5 }];
  assert.ok(smurfHint(40, flex));
});
