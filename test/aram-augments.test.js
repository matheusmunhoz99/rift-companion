const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ARAM_AUGMENTS,
  evaluateAugmentForChampion,
  matchAugmentByName,
  rankAugmentsForChampion,
} = require('../dist-electron/overlay/aram-augments.js');

describe('ARAM: Desordem — Cartas de Aprimoramento (aram-augments)', () => {
  it('inclui o catálogo completo de cartas em português', () => {
    assert.ok(ARAM_AUGMENTS.length >= 300);
    const jinx = matchAugmentByName('Hora da Jinx');
    assert.ok(jinx, 'Deve encontrar Hora da Jinx');
    assert.equal(jinx.name, 'Hora da Jinx');
  });

  it('avalia cartas de velocidade de ataque / crítico como BOA para Vayne e cartas de cura/AP como RUIM', () => {
    const jinx = matchAugmentByName('Hora da Jinx');
    const crit = matchAugmentByName('Ritmo Crítico');
    const scope = matchAugmentByName('Armas Extensivas');
    const heal = matchAugmentByName('Tudo por Você');
    const missile = matchAugmentByName('Projétil Mágico');

    const evJinx = evaluateAugmentForChampion('Vayne', jinx);
    const evCrit = evaluateAugmentForChampion('Vayne', crit);
    const evScope = evaluateAugmentForChampion('Vayne', scope);
    const evHeal = evaluateAugmentForChampion('Vayne', heal);
    const evMissile = evaluateAugmentForChampion('Vayne', missile);

    assert.equal(evJinx.tier, 'boa');
    assert.ok(evJinx.pickRate >= 22);
    assert.equal(evCrit.tier, 'boa');
    assert.equal(evScope.tier, 'boa');

    assert.equal(evHeal.tier, 'ruim');
    assert.ok(evHeal.pickRate <= 9);
    assert.equal(evMissile.tier, 'ruim');
  });

  it('avalia cartas de cura/escudo como BOA para Lulu e cartas de tanque/CC como BOA para Leona', () => {
    const heal = matchAugmentByName('Tudo por Você');
    const colossus = matchAugmentByName('Coragem do Colosso');

    const evLulu = evaluateAugmentForChampion('Lulu', heal);
    const evLeona = evaluateAugmentForChampion('Leona', colossus);

    assert.equal(evLulu.tier, 'boa');
    assert.equal(evLeona.tier, 'boa');
  });

  it('ordena todas as cartas da maior % de escolha para a menor no campeão', () => {
    const ranked = rankAugmentsForChampion(67); // Vayne
    assert.equal(ranked.length, ARAM_AUGMENTS.length);
    assert.ok(ranked[0].pickRate >= ranked[ranked.length - 1].pickRate);
    assert.equal(ranked[0].tier, 'boa');
    assert.equal(ranked[ranked.length - 1].tier, 'ruim');
  });
});
