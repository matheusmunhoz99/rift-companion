const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { BUDDY_ID, BUDDY_JID } = require('../dist-electron/invisible/buddy.js');
const { DEFAULT_TIMINGS } = require('../dist-electron/overlay/live-dashboard.js');
const { clearBuddyChat, ObjectiveAnnouncer } = require('../dist-electron/overlay/objective-announcer.js');

describe('ObjectiveAnnouncer e limpeza do chat ao fim da partida', () => {
  it('clearBuddyChat apaga mensagens, zera não-lidas e remove a conversa do contato Rift Companion', async () => {
    const calls = [];
    const fakeCreds = { port: 12345, password: 'pw', pid: 1 };
    const fakeRequest = async (_creds, method, endpoint, body) => {
      calls.push({ method, endpoint, body });
      if (method === 'GET' && endpoint === '/lol-chat/v1/conversations') {
        return [
          { id: `${BUDDY_ID}@eu1.pvp.net`, pid: `${BUDDY_ID}@eu1.pvp.net` },
          { id: 'outro-amigo@br1.pvp.net', pid: 'outro-amigo@br1.pvp.net' },
        ];
      }
      return undefined;
    };

    await clearBuddyChat(fakeCreds, fakeRequest);

    const enc = encodeURIComponent(`${BUDDY_ID}@eu1.pvp.net`);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.endpoint}`),
      [
        'GET /lol-chat/v1/conversations',
        `DELETE /lol-chat/v1/conversations/${enc}/messages`,
        `PUT /lol-chat/v1/conversations/${enc}`,
        `DELETE /lol-chat/v1/conversations/${enc}`,
      ],
    );
    assert.deepEqual(calls[2].body, { isMuted: true, unreadMessageCount: 0 });
  });

  it('clearBuddyChat usa fallback para BUDDY_JID se GET conversations falhar', async () => {
    const calls = [];
    const fakeRequest = async (_creds, method, endpoint) => {
      calls.push(`${method} ${endpoint}`);
      if (method === 'GET') throw new Error('LCU ocupado');
      return undefined;
    };

    await clearBuddyChat({ port: 12345, password: 'pw', pid: 1 }, fakeRequest);

    const enc = encodeURIComponent(BUDDY_JID);
    assert.deepEqual(calls, [
      'GET /lol-chat/v1/conversations',
      `DELETE /lol-chat/v1/conversations/${enc}/messages`,
      `PUT /lol-chat/v1/conversations/${enc}`,
      `DELETE /lol-chat/v1/conversations/${enc}`,
    ]);
  });

  it('ObjectiveAnnouncer limpa o chat automaticamente ao sair da partida depois de enviar avisos', async () => {
    class FakeConnector extends EventEmitter {
      phase = 'InProgress';
      getState() { return { gameflowPhase: this.phase }; }
    }
    const connector = new FakeConnector();
    let clears = 0;
    const sentLines = [];
    const fakeRaw = async () => ({
      gameData: { gameTime: 30, gameMode: 'CLASSIC', mapNumber: 11 },
      activePlayer: { summonerName: 'Eu', level: 1 },
      allPlayers: [{
        summonerName: 'Eu',
        championName: 'Jinx',
        team: 'ORDER',
        level: 1,
        scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 },
      }],
      events: { Events: [] },
    });

    const announcer = new ObjectiveAnnouncer(
      connector,
      {
        chat: {
          hasActiveChat: () => true,
          sendBuddyMessages: (lines) => sentLines.push(...lines),
        },
        chatEnabled: () => true,
        clearChat: () => { clears++; },
        speak: () => undefined,
        voiceEnabled: () => false,
      },
      async () => ({ dragonFirst: 300, dragonRespawn: 300, dragonSoulCount: 4, baronFirst: 1200, baronRespawn: 360, elderFirst: 0, elderRespawn: 360, grubsFirst: 480, grubsUntil: 885, heraldFirst: 900, heraldUntil: 1185, atakhanFirst: 0, buffFirst: 55, smallCampFirst: 55, largeCampFirst: 67, scuttleFirst: 175, buffRespawn: 300, campRespawn: 135, scuttleRespawn: 150, inhibRespawn: 300 }),
      fakeRaw,
    );

    try {
      announcer.sync();
      await new Promise((r) => setTimeout(r, 30));
      assert.ok(sentLines.length >= 1, 'Deveria ter enviado saudação no chat durante InProgress');

      connector.phase = 'PreEndOfGame';
      connector.emit('state');
      assert.equal(clears, 1, 'Deveria limpar o chat ao sair da partida');
    } finally {
      connector.phase = 'None';
      connector.emit('state');
    }
  });

  it('ObjectiveAnnouncer envia saudação e objetivos no Modo de treino (PRACTICETOOL) e reseta ao reiniciar o jogo', async () => {
    class FakeConnector extends EventEmitter {
      phase = 'InProgress';
      getState() { return { gameflowPhase: this.phase }; }
    }
    const connector = new FakeConnector();
    const sentLines = [];
    let gameTime = 275;
    const fakeRaw = async () => ({
      gameData: { gameTime, gameMode: 'PRACTICETOOL', mapNumber: 11 },
      activePlayer: { summonerName: 'Eu', level: 6 },
      allPlayers: [{
        summonerName: 'Eu',
        championName: 'Katarina',
        team: 'ORDER',
        level: 6,
        scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 },
      }],
      events: { Events: [{ EventName: 'GameStart', EventTime: 0 }] },
    });

    const announcer = new ObjectiveAnnouncer(
      connector,
      {
        chat: {
          hasActiveChat: () => true,
          sendBuddyMessages: (lines) => sentLines.push(...lines),
        },
        chatEnabled: () => true,
        clearChat: () => undefined,
        speak: () => undefined,
        voiceEnabled: () => false,
      },
      async () => DEFAULT_TIMINGS,
      fakeRaw,
    );

    try {
      announcer.sync();
      await new Promise((r) => setTimeout(r, 30));
      assert.ok(sentLines.some((l) => l.includes('Partida começou')), 'Deveria enviar saudação no PRACTICETOOL');
      assert.ok(sentLines.some((l) => l.includes('Dragão nasce em 30 s')), 'Deveria avisar do Dragão em 30 s no PRACTICETOOL');

      // Simula "Reiniciar partida" no Modo de treino (relógio volta para 10 s e depois chega a 275 s de novo)
      const countBeforeReset = sentLines.length;
      gameTime = 10;
      await announcer.poll();
      assert.ok(sentLines.length > countBeforeReset, 'Deveria reenviar saudação após reiniciar o Modo de treino');

      gameTime = 275;
      await announcer.poll();
      assert.ok(sentLines.slice(countBeforeReset).some((l) => l.includes('Dragão nasce em 30 s')), 'Deveria reavisar objetivos após reset');
    } finally {
      connector.phase = 'None';
      connector.emit('state');
    }
  });
});
