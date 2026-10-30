const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');

const { findEncounters } = loadTs('live/encounters');
const { assignTeamPositions, guessLaneOpponent, guessOwnPosition, damageProfile, positionOrder } =
  loadTs('stats/match-context');
const { estimateWinChance } = loadTs('live/win-chance');

// ---- findEncounters: cruzar a partida atual com as suas partidas ----

const part = (puuid, riotId, teamId, championId, win) => ({
  puuid, riotId, teamId, championId, win, kills: 1, deaths: 2, assists: 3,
});

test('findEncounters acha aliado e inimigo por puuid, com lado e placar', () => {
  const match = {
    matchId: 'M1', queueId: 420, gameEndTimestamp: 10,
    participants: [part('ME', 'Eu#jung', 100, 64, true), part('A', 'Amigo#BR1', 100, 1, true), part('B', 'Rival#BR1', 200, 2, false)],
  };
  const live = [
    { puuid: 'ME', riotId: 'Eu#jung', teamId: 100 },
    { puuid: 'A', riotId: 'Amigo#BR1', teamId: 200 },
    { puuid: 'B', riotId: 'Rival#BR1', teamId: 100 },
  ];
  const result = findEncounters('ME', 'Eu#jung', 100, live, [match]);
  const amigo = result.find((r) => r.riotId === 'Amigo#BR1');
  const rival = result.find((r) => r.riotId === 'Rival#BR1');
  assert.equal(amigo.allyNow, false, 'Amigo agora está no time inimigo');
  assert.equal(amigo.encounters[0].sameTeam, true, 'mas jogaram juntos antes');
  assert.equal(amigo.encounters[0].youWon, true);
  assert.equal(rival.allyNow, true);
  assert.equal(rival.encounters[0].sameTeam, false, 'Rival jogou contra antes');
});

test('findEncounters reconhece por Riot ID quando não há puuid (dados locais)', () => {
  const match = {
    matchId: 'M2', queueId: 420, gameEndTimestamp: 1,
    participants: [part('ME', 'Eu#jung', 100, 64, true), part('X', 'Fulano#BR1', 100, 5, true)],
  };
  const live = [
    { puuid: '', riotId: 'Eu#jung', teamId: 100 },
    { puuid: '', riotId: 'fulano#br1', teamId: 100 },
  ];
  const result = findEncounters('ME', 'Eu#jung', 100, live, [match]);
  assert.equal(result.length, 1);
  assert.equal(result[0].riotId.toLowerCase(), 'fulano#br1');
});

test('findEncounters não inclui você mesmo', () => {
  const match = { matchId: 'M3', queueId: 420, gameEndTimestamp: 1, participants: [part('ME', 'Eu#jung', 100, 64, true)] };
  const live = [{ puuid: 'ME', riotId: 'Eu#jung', teamId: 100 }];
  assert.equal(findEncounters('ME', 'Eu#jung', 100, live, [match]).length, 0);
});

// ---- assignTeamPositions: rota de cada jogador ----

const tierList = [
  { championId: 86, position: 'TOP', games: 1000 },      // Garen topo
  { championId: 64, position: 'JUNGLE', games: 1000 },    // Lee Sin selva
  { championId: 103, position: 'MIDDLE', games: 1000 },   // Ahri meio
  { championId: 222, position: 'BOTTOM', games: 1000 },   // Jinx adc
  { championId: 412, position: 'UTILITY', games: 1000 },  // Thresh sup
];

test('assignTeamPositions usa a rota informada pelo jogo acima de tudo', () => {
  const players = [
    { championId: 222, summonerSpellIds: [4, 7], known: 'TOP' }, // Jinx marcada como topo
    { championId: 86, summonerSpellIds: [4, 12], known: null },
    { championId: 103, summonerSpellIds: [4, 14], known: null },
    { championId: 64, summonerSpellIds: [4, 11], known: null },
    { championId: 412, summonerSpellIds: [4, 14], known: null },
  ];
  const lanes = assignTeamPositions(players, tierList);
  assert.equal(lanes[0], 'TOP', 'respeita a rota informada mesmo contra a estatística');
});

test('assignTeamPositions manda quem tem Golpear para a selva', () => {
  const players = [
    { championId: 86, summonerSpellIds: [4, 12], known: null },
    { championId: 103, summonerSpellIds: [4, 14], known: null },
    { championId: 222, summonerSpellIds: [4, 11], known: null }, // Jinx com Golpear -> selva
    { championId: 64, summonerSpellIds: [4, 14], known: null },
    { championId: 412, summonerSpellIds: [4, 14], known: null },
  ];
  const lanes = assignTeamPositions(players, tierList);
  assert.equal(lanes[2], 'JUNGLE', 'o Golpear define a selva');
});

test('assignTeamPositions estima pela coleta quando não há dica', () => {
  const players = [86, 64, 103, 222, 412].map((id) => ({ championId: id, summonerSpellIds: [4, 14], known: null }));
  assert.deepEqual(assignTeamPositions(players, tierList), ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
});

test('assignTeamPositions devolve null sem os 5', () => {
  assert.equal(assignTeamPositions([{ championId: 86, summonerSpellIds: [], known: null }], tierList), null);
});

test('guessLaneOpponent acha o inimigo da sua rota', () => {
  assert.equal(guessLaneOpponent('MIDDLE', [86, 64, 103, 222, 412], tierList), 103);
});

test('guessOwnPosition deduz a sua rota pelo time', () => {
  assert.equal(guessOwnPosition(64, [86, 103, 222, 412], tierList), 'JUNGLE');
});

test('positionOrder ordena topo→suporte', () => {
  const order = ['UTILITY', 'TOP', 'JUNGLE'].sort((a, b) => positionOrder(a) - positionOrder(b));
  assert.deepEqual(order, ['TOP', 'JUNGLE', 'UTILITY']);
});

// ---- damageProfile: perfil de dano do time inimigo ----

const champ = (attack, magic) => ({ attack, magic });

test('damageProfile classifica time mágico, físico e misto', () => {
  assert.equal(damageProfile([champ(2, 9), champ(1, 8), champ(3, 7)]).damage, 'ap');
  assert.equal(damageProfile([champ(9, 1), champ(8, 2), champ(7, 2)]).damage, 'ad');
  assert.equal(damageProfile([champ(6, 4), champ(6, 4), champ(7, 3)]).damage, 'mixed'); // média ~0.37
});

test('damageProfile é null com menos de 2 campeões conhecidos', () => {
  assert.equal(damageProfile([champ(5, 5), null]), null);
});

// ---- estimateWinChance ----

const ranked = (tier, rank, lp = 50) => [{ queueType: 'RANKED_SOLO_5x5', tier, rank, leaguePoints: lp, wins: 1, losses: 1 }];
const player = (teamId, tier, rankDiv) => ({ teamId, ranked: tier ? ranked(tier, rankDiv) : [] });

test('estimateWinChance favorece o time de elo mais alto', () => {
  const participants = [
    player(100, 'DIAMOND', 'I'), player(100, 'DIAMOND', 'II'),
    player(200, 'GOLD', 'IV'), player(200, 'SILVER', 'I'),
  ];
  const chance = estimateWinChance(participants, 100);
  assert.ok(chance.allyPercent > 55, `aliado mais forte deve passar de 55%: ${chance.allyPercent}`);
});

test('estimateWinChance é null sem ninguém com elo', () => {
  assert.equal(estimateWinChance([player(100, null), player(200, null)], 100), null);
});

test('estimateWinChance fica entre 10 e 90', () => {
  const participants = [player(100, 'CHALLENGER', 'I'), player(200, 'IRON', 'IV')];
  const chance = estimateWinChance(participants, 100);
  assert.ok(chance.allyPercent <= 90 && chance.allyPercent >= 10, `limitado: ${chance.allyPercent}`);
});
