const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/renderer');
const { modeOf } = loadTs('riot/modes');
const { buildCoachReport, postGameMode } = loadTs('postgame/coach');

test('modo pela fila: ARAM, Desordem e Arena sem rotas; URF sem estatísticas de ranqueada', () => {
  assert.equal(modeOf(420, 11).roles, true);
  assert.equal(modeOf(420, 11).riftStats, true);
  assert.equal(modeOf(450, 12).lanes, false);
  assert.equal(modeOf(2400, 12).name, 'ARAM: Desordem');
  assert.equal(modeOf(1700, 30).kind, 'arena');
  assert.equal(modeOf(1900, 11).lanes, true);
  assert.equal(modeOf(1900, 11).roles, false, 'URF não tem função atribuída: sem "Autofill"');
  assert.equal(modeOf(1900, 11).riftStats, false);
  assert.equal(modeOf(430, 11).roles, false, 'às cegas não atribui função');
  assert.equal(modeOf(9999, 12).kind, 'aram', 'fila nova no Abismo Uivante');
  assert.equal(modeOf(9999, 77).lanes, false, 'mapa desconhecido: não assume rotas');
});

test('fim de jogo: modo pelo gameMode do cliente quando a fila é desconhecida', () => {
  assert.equal(postGameMode({ queueId: 9999, gameMode: 'KIWI' }).kind, 'aram');
  assert.equal(postGameMode({ queueId: null, gameMode: 'CHERRY' }).kind, 'arena');
  assert.equal(postGameMode({ queueId: 420, gameMode: 'CLASSIC' }).kind, 'rift');
});

const PUUID = 'me';
const match = (i, { vision = 5, cs = 60, deaths = 5 } = {}) => ({
  matchId: `BR1_${i}`, queueId: 450, mapId: 12, gameVersion: '16.21', gameEndTimestamp: i, gameDurationSeconds: 1200,
  participants: [
    { puuid: PUUID, riotId: 'Eu#br', championId: 19, teamId: 100, position: '', win: true, kills: 10, deaths, assists: 20, champLevel: 18,
      cs, gold: 12000, damageToChampions: 30000, visionScore: vision, items: [], summonerSpellIds: [], perks: {} },
    { puuid: 'ally', riotId: 'A#br', championId: 1, teamId: 100, position: '', win: true, kills: 20, deaths: 5, assists: 10, champLevel: 18,
      cs: 50, gold: 11000, damageToChampions: 25000, visionScore: 0, items: [], summonerSpellIds: [], perks: {} },
  ],
});
const postGame = (queueId, gameMode, me) => ({
  gameId: 999, queueId, queueType: '', gameMode, durationSeconds: 1200, endedAt: 0, myTeamWon: false,
  players: [{ isMe: true, kills: 3, deaths: 14, assists: 10, cs: 20, gold: 8000, damageToChampions: 15000, vision: 0, killShare: 0.3,
    damageShare: 0.15, largestMultiKill: 1, score: 0, rank: 5, ...me }],
});

test('coach em ARAM: sem visão nas métricas e dicas sem sentinela nem rotação', () => {
  const recent = Array.from({ length: 6 }, (_, i) => match(i));
  const report = buildCoachReport(postGame(450, 'ARAM'), recent, PUUID);
  assert.ok(report);
  assert.equal(report.metrics.some((m) => m.key === 'visionPerMin'), false);
  const tips = report.improve.map((i) => i.text).join(' ');
  assert.doesNotMatch(tips, /sentinela|rotacionar|visão do mapa|presença de mapa/i);

  // Dano na média, mas pouca participação: a dica fala de chegar nas lutas, não de mapa.
  const fighter = buildCoachReport(postGame(450, 'ARAM', { kills: 10, deaths: 14, assists: 20, damageToChampions: 30000, cs: 60, gold: 12000 }), recent, PUUID);
  const text = fighter.improve.map((i) => i.text).join(' ');
  assert.match(text, /lutas do time/);
  assert.doesNotMatch(text, /sentinela|rotacionar|visão do mapa|presença de mapa/i);
});

test('coach no Rift continua com visão', () => {
  const recent = Array.from({ length: 6 }, (_, i) => ({ ...match(i), queueId: 420, mapId: 11 }));
  const report = buildCoachReport(postGame(420, 'CLASSIC'), recent, PUUID);
  assert.ok(report.metrics.some((m) => m.key === 'visionPerMin'));
});
