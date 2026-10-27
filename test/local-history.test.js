const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toSummary, mergePage } = require('../dist-electron/riot/local-history');

const LOCAL = 'df3752a5-7dd0-566c-8c5d-631bacd23502';
const API = 'api-puuid-do-jogador';

function lcuGame(gameId, endMs, queueId = 2400) {
  const duration = 900;
  return {
    gameId, platformId: 'BR1', gameCreation: endMs - duration * 1000, gameDuration: duration, queueId, mapId: 12, gameVersion: '16.21.1',
    participantIdentities: [
      { participantId: 1, player: { puuid: LOCAL, gameName: 'Eu era o Jungle', tagLine: 'jung' } },
      { participantId: 2, player: { puuid: 'outro', gameName: 'Outro', tagLine: 'BR1' } },
    ],
    participants: [
      { participantId: 1, championId: 19, teamId: 100, spell1Id: 4, spell2Id: 32, timeline: { lane: 'MIDDLE', role: 'SOLO' },
        stats: { win: true, kills: 9, deaths: 2, assists: 14, champLevel: 18, totalMinionsKilled: 40, neutralMinionsKilled: 2, goldEarned: 15000,
          totalDamageDealtToChampions: 30000, visionScore: 5, item0: 3153, item6: 2052, perk0: 8010, perk1: 9111, perkPrimaryStyle: 8000, perkSubStyle: 8400,
          statPerk0: 5008, statPerk1: 5008, statPerk2: 5001 } },
      { participantId: 2, championId: 99, teamId: 200, spell1Id: 4, spell2Id: 32, stats: { win: false, kills: 1 } },
    ],
  };
}

const server = (id, end) => ({ matchId: id, gameEndTimestamp: end, participants: [] });

test('partida do cliente vira o formato do servidor, com o PUUID da API para o próprio jogador', () => {
  const summary = toSummary(lcuGame(3297701879, 1_000_000_000), LOCAL, API);
  assert.equal(summary.matchId, 'BR1_3297701879');
  assert.equal(summary.queueId, 2400);
  assert.equal(summary.source, 'local');
  assert.equal(summary.gameEndTimestamp, 1_000_000_000);
  const me = summary.participants.find((p) => p.puuid === API);
  assert.ok(me, 'o jogador logado é reconhecido pelo PUUID da API');
  assert.equal(me.riotId, 'Eu era o Jungle#jung');
  assert.equal(me.cs, 42);
  assert.equal(me.position, 'middle');
  assert.deepEqual(me.items, [3153, 0, 0, 0, 0, 0, 2052]);
  assert.deepEqual(me.perks.selections, [8010, 9111]);
  assert.equal(summary.participants[1].win, false);
});

test('partida sem o jogador logado é descartada', () => {
  assert.equal(toSummary(lcuGame(1, 1), 'outro-local', API), null);
});

test('mistura entra na página certa pelo horário e não duplica', () => {
  const page = [server('BR1_3', 3000), server('BR1_2', 2000)];
  const local = [
    { matchId: 'BR1_9', gameEndTimestamp: 9000 },  // hoje, mais nova que tudo
    { matchId: 'BR1_25', gameEndTimestamp: 2500 }, // entre as duas do servidor
    { matchId: 'BR1_1', gameEndTimestamp: 1000 },  // mais velha: fica para a próxima página
    { matchId: 'BR1_3', gameEndTimestamp: 3000 },  // já veio do servidor
  ];
  const merged = mergePage(page, local, Infinity, true);
  assert.deepEqual(merged.map((m) => m.matchId), ['BR1_9', 'BR1_3', 'BR1_25', 'BR1_2']);
  // Última página (não veio cheia): entra o que é mais velho também.
  assert.deepEqual(mergePage(page, local, Infinity, false).map((m) => m.matchId), ['BR1_9', 'BR1_3', 'BR1_25', 'BR1_2', 'BR1_1']);
  // Página seguinte: só o que é mais velho que a partida antes dela.
  assert.deepEqual(mergePage([server('BR1_0', 500)], local, 2000, false).map((m) => m.matchId), ['BR1_1', 'BR1_0']);
});
