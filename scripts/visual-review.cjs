// Revisão visual: renderiza a interface compilada (renderer/dist) num Chromium com pontes
// falsas no lugar do Electron/LoL. Estatísticas, perfil e histórico vêm da API real.
//
//   npm run build:renderer
//   SIM_RIOT_ID="Nome#TAG" node scripts/visual-review.cjs <cenário> [largura] [saida.png] [seletor] [altura]
//
// Cenários: home offline play queue champselect live postgame tierlist builds history
// progress settings ("home&whatsnew" mostra a tela de novidades). Precisa do Playwright.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const API = process.env.RIFT_API_URL || 'https://rift-api.workscanner.com.br';
const [simName = 'Riot', simTag = 'BR1'] = (process.env.SIM_RIOT_ID || 'Riot#BR1').split('#');
const ME = { gameName: simName, tagLine: simTag };
const DIST = path.join(__dirname, '..', 'renderer', 'dist', 'renderer', 'browser');
const [scenario = 'home', widthArg = '1440', out = 'out.png', selector = '', heightArg = '900'] = process.argv.slice(2);
const cache = new Map();

async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(API + path, { headers: { 'User-Agent': 'RiftCompanion-sim/1.0' } });
  const body = res.ok ? await res.json() : null;
  if (!res.ok) console.log('api', res.status, path);
  cache.set(path, body);
  return body;
}

const P = (n) => (String(n) + 'x'.repeat(78)).slice(0, 78);
const rank = (tier, r, lp, w, l) => [{ queueType: 'RANKED_SOLO_5x5', tier, rank: r, leaguePoints: lp, wins: w, losses: l }];

function liveGame() {
  const pl = (n, riotId, champ, team, ranked, mastery, hidden) => ({
    puuid: hidden ? '' : P(n), riotId: hidden ? '' : riotId, championId: champ, teamId: team,
    summonerSpellIds: n === 2 || n === 7 ? [11, 4] : [4, n % 2 ? 12 : 14], keystoneId: 8010, subStyleId: 8400, ranked,
    mastery: mastery ? { level: 10, points: mastery } : null,
  });
  // SIM_QUEUE=2400 (ou 450) simula ARAM: Abismo Uivante, sem rotas.
  const queueId = Number(process.env.SIM_QUEUE || 420);
  const mapId = [450, 2400, 100, 720].includes(queueId) ? 12 : 11;
  return { gameId: 777, queueId, mapId, gameStartTime: Date.now() - 540000, participants: [
    pl(1, 'Aliado Topo#BR1', 39, 100, rank('PLATINUM', 'II', 22, 60, 70), 57000),
    pl(2, `${ME.gameName}#${ME.tagLine}`, 19, 100, rank('PLATINUM', 'IV', 0, 70, 80), 180000),
    pl(3, 'Aliado Meio#BR1', 7, 100, rank('PLATINUM', 'III', 53, 9, 6), 4000),
    pl(4, 'Aliado Atirador#BR1', 236, 100, rank('PLATINUM', 'III', 7, 40, 38), 140000),
    pl(5, '', 201, 100, [], null, true),
    pl(6, 'Inimigo Topo#BR1', 86, 200, rank('EMERALD', 'III', 79, 144, 128), 188000),
    pl(7, 'Inimigo Selva#BR1', 102, 200, rank('PLATINUM', 'I', 12, 50, 41), 124000),
    pl(8, 'Inimigo Meio#BR1', 777, 200, rank('PLATINUM', 'IV', 30, 20, 25), 15000),
    pl(9, 'Inimigo Atirador#BR1', 18, 200, rank('GOLD', 'I', 80, 30, 22), 60000),
    pl(10, 'Inimigo Suporte#BR1', 80, 200, rank('PLATINUM', 'III', 40, 12, 9), 4000),
  ] };
}

const premades = { groups: [], complete: true, profiles: {
  [P(1)]: { mainRole: 'JUNGLE', roleShare: 0.7, autofill: true, oneTrick: false, topChampions: [{ championId: 39, games: 5 }], games: 8 },
  [P(4)]: { mainRole: 'BOTTOM', roleShare: 0.9, autofill: false, oneTrick: false, topChampions: [{ championId: 236, games: 4 }], games: 8 },
}, premades: [{ puuids: [P(7), P(9)], size: 2, confidence: 95 }] };

// Cliente do LoL: grupo de cada jogador (teamParticipantId) por time + campeão. Você + Meio
// entraram juntos; Selva + Atirador inimigos também. O suporte inimigo sem grupo informado
// deixa o time 200 "aberto", para a memória (Topo + Meio inimigos, 3x) aparecer.
const clientTeams = { gameId: 777, queueId: 420, players: [
  { puuid: 'l1', teamId: 100, championId: 39, partyId: 1, position: 'TOP', autofill: true },
  { puuid: 'l2', teamId: 100, championId: 19, partyId: 11, position: 'JUNGLE', autofill: false },
  { puuid: 'l3', teamId: 100, championId: 7, partyId: 11, position: 'MIDDLE', autofill: false },
  { puuid: 'l4', teamId: 100, championId: 236, partyId: 4, position: 'BOTTOM', autofill: false },
  { puuid: 'l5', teamId: 100, championId: 201, partyId: 5, position: 'UTILITY', autofill: false },
  { puuid: 'l6', teamId: 200, championId: 86, partyId: 6, position: 'TOP', autofill: false },
  { puuid: 'l7', teamId: 200, championId: 102, partyId: 22, position: 'JUNGLE', autofill: false },
  { puuid: 'l8', teamId: 200, championId: 777, partyId: 8, position: 'MIDDLE', autofill: false },
  { puuid: 'l9', teamId: 200, championId: 18, partyId: 22, position: 'BOTTOM', autofill: false },
  { puuid: 'l10', teamId: 200, championId: 80, partyId: null, position: 'UTILITY', autofill: null },
] };

const ARAM_SIM = [450, 2400, 100, 720].includes(Number(process.env.SIM_QUEUE || 420));
const plan = ARAM_SIM ? { plan: { resumo: 'Seu time tem mais engage (Braum, Irelia) e eles têm mais poke (Caitlyn, Neeko): vocês vencem forçando a luta cedo, antes do poke desgastar.',
  pontos: [
    { tipo: 'oportunidade', texto: 'Braum e Irelia iniciam bem: lutem juntos quando os dois tiverem as ultimates.' },
    { tipo: 'cuidado', texto: 'Caitlyn e Neeko desgastam de longe: não fiquem parados no alcance antes da luta.' },
    { tipo: 'dica', texto: 'Pegue os pacotes de vida no meio da rota para segurar o poke.' } ],
  build: 'Contra a cura do Warwick inimigo e da Soraka, um item de anticura cedo vale muito.' }, build: null } : { plan: { resumo: 'Seu time tem mais controle de grupo e luta melhor no meio do jogo: com Braum e Irelia iniciando, vocês ganham as lutas em volta dos objetivos se chegarem juntos.',
  pontos: [
    { tipo: 'oportunidade', texto: 'Meio e atirador têm o melhor cenário de gank: Lucian e Braum dão controle, e Yone e Tristana têm pouca fuga no início.' },
    { tipo: 'cuidado', texto: 'Shyvana fica forte rápido nos campos: evite trocar selva com ela depois do nível 6.' },
    { tipo: 'cuidado', texto: 'O duo inimigo (Shyvana + Tristana) tende a jogar junto no bot: vale ward na entrada do rio.' },
    { tipo: 'dica', texto: 'Garen e Pantheon buscam lutas de engage: chegue junto da Irelia para ela não ficar isolada.' } ],
  build: 'O núcleo 1 é o padrão; contra um time de dano físico, Presságio de Randuin sobe bastante.' },
  build: { position: 'JUNGLE', games: 3014, winRate: 0.498,
    cores: [{ items: [6631, 3153, 6333], games: 92, winRate: 0.576 }, { items: [6631, 3153, 3075], games: 93, winRate: 0.473 }],
    boots: [{ itemId: 3047, games: 1314, winRate: 0.497 }, { itemId: 3111, games: 1007, winRate: 0.512 }],
    situational: [{ itemId: 3143, winRate: 0.56, lift: 1.6 }],
    opponent: { championId: 102, champion: 'Shyvana', games: 42, winRate: 0.43 } } };

function champSelect() {
  const m = (cellId, championId, pos, isMe, extra = {}) => ({ cellId, championId, assignedPosition: pos, isMe, spell1Id: 4, spell2Id: pos === 'jungle' ? 11 : 14, name: isMe ? ME.gameName : null, riotId: isMe ? `${ME.gameName}#${ME.tagLine}` : null, ...extra });
  return { championId: 0, pickIntentChampionId: 19, assignedPosition: 'jungle',
    team: [m(0, 39, 'top', false, { locked: true }), m(1, 0, 'jungle', true, { hoverChampionId: 19, acting: 'pick' }), m(2, 7, 'middle', false, { locked: true }), m(3, 0, 'bottom', false, { hoverChampionId: 236 }), m(4, 201, 'utility', false, { locked: true })],
    pickActionId: 7, pickableChampionIds: [], benchEnabled: false, benchChampionIds: [], allowRerolling: false, rerollsRemaining: 0, trades: [],
    enemyChampionIds: [86, 102, 777], enemies: [{ cellId: 5, championId: 86, assignedPosition: '', isMe: false }, { cellId: 6, championId: 102, assignedPosition: '', isMe: false }, { cellId: 7, championId: 777, assignedPosition: '', isMe: false }, { cellId: 8, championId: 0, assignedPosition: '', isMe: false }, { cellId: 9, championId: 0, assignedPosition: '', isMe: false }],
    bans: { ally: [157, 238, 64], enemy: [555, 122, 266] }, phase: 'BAN_PICK', timerEndsAt: Date.now() + 22000, availableChampionIds: [] };
}

function state(scn) {
  const summoner = { puuid: 'sim', summonerId: 1, gameName: ME.gameName, tagLine: ME.tagLine, summonerLevel: 312, profileIconId: 6007 };
  const base = { status: 'connected', summoner, gameflowPhase: 'None', champSelect: null, platformId: 'BR1', lobby: null, search: null, readyCheck: null };
  if (scn === 'offline') return { ...base, status: 'waiting-client', summoner: null, gameflowPhase: null, account: { gameName: ME.gameName, tagLine: ME.tagLine, platformId: 'BR1' } };
  if (scn === 'live') return { ...base, gameflowPhase: 'InProgress' };
  if (scn === 'champselect') return { ...base, gameflowPhase: 'ChampSelect', champSelect: champSelect() };
  if (scn === 'postgame') return { ...base, gameflowPhase: 'EndOfGame' };
  if (scn === 'play' || scn === 'queue') return { ...base, gameflowPhase: scn === 'queue' ? 'Matchmaking' : 'Lobby',
    lobby: { queueId: 420, showPositionSelector: true, maxLobbySize: 2, canStartActivity: true, isLeader: true, localPlayerSlots: [], scarcePositions: ['UTILITY'], invitations: [],
      members: [{ puuid: 'sim', summonerId: 1, gameName: ME.gameName, tagLine: ME.tagLine, summonerLevel: 312, summonerIconId: 6007, isLeader: true, isBot: false, firstPosition: 'JUNGLE', secondPosition: 'MIDDLE', playerSlots: [] }] },
    search: scn === 'queue' ? { searchState: 'Searching', timeInQueue: 84, estimatedQueueTime: 120, errors: [] } : null };
  return base;
}

function rankHistory() {
  const out = []; let lp = 30; const t0 = Date.now() - 6 * 86400e3 + 3 * 3600e3;
  const champs = [19, 19, 64, 19, 102, 19, 233, 19, 64, 19, 19, 102, 19, 64, 19, 19];
  for (let i = 0; i < 16; i++) { const win = [1,1,0,1,0,1,1,0,1,1,0,1,1,0,1,1][i] === 1; const d = win ? 22 : -18; lp += d;
    out.push({ at: t0 + i * 9 * 3600e3, queue: 'solo', tier: 'PLATINUM', division: lp >= 100 ? 'III' : 'IV', lp: ((lp % 100) + 100) % 100, lpChange: d, win, championId: champs[i], note: null }); }
  return out;
}

async function postGame() {
  const me = await api(`/v1/players/BR1/${encodeURIComponent(ME.gameName)}/${ME.tagLine}`);
  const matches = await api(`/v1/matches/BR1/${me.puuid}?start=0&count=10`);
  const m = matches.find((x) => x.queueId === 420) ?? matches[0];
  const teams = { 100: m.participants.filter((p) => p.teamId === 100), 200: m.participants.filter((p) => p.teamId === 200) };
  const players = m.participants.map((p) => {
    const team = teams[p.teamId];
    const tk = team.reduce((s, x) => s + x.kills, 0) || 1, td = team.reduce((s, x) => s + x.damageToChampions, 0) || 1;
    return { puuid: p.puuid, riotId: p.riotId, championId: p.championId, teamId: p.teamId, win: p.win, isMe: p.puuid === me.puuid, level: p.champLevel,
      kills: p.kills, deaths: p.deaths, assists: p.assists, damageToChampions: p.damageToChampions, damageTaken: Math.round(p.damageToChampions * 1.1), damageMitigated: 9000,
      healing: 3000, gold: p.gold, cs: p.cs, vision: p.visionScore, wardsPlaced: 8, wardsKilled: 2, largestMultiKill: 1, structureDamage: 2000,
      items: p.items, spellIds: p.summonerSpellIds, killShare: (p.kills + p.assists) / tk, damageShare: p.damageToChampions / td, score: 0, rank: 0 };
  });
  players.sort((a, b) => (b.kills + b.assists) / Math.max(1, b.deaths) - (a.kills + a.assists) / Math.max(1, a.deaths)).forEach((p, i) => { p.rank = i + 1; p.score = 10 - i * 0.6; });
  const meP = players.find((p) => p.isMe);
  return { gameId: Number(m.matchId.split('_')[1]), queueId: m.queueId, queueType: 'RANKED_SOLO_5x5', gameMode: 'CLASSIC', durationSeconds: m.gameDurationSeconds ?? 1800,
    endedAt: m.gameEndTimestamp, myTeamWon: meP ? meP.win : null, players };
}

(async () => {
  const st = state(scenario);
  const post = scenario === 'postgame' ? await postGame() : null;
  const view = { home: 'home', offline: 'home', play: 'play', queue: 'play', champselect: 'champ-select', live: 'live', postgame: 'live',
    tierlist: 'tierlist', builds: 'builds&champion=19&position=JUNGLE', history: `history&player=${encodeURIComponent(ME.gameName + '#' + ME.tagLine)}`,
    progress: 'progress', settings: 'settings' }[scenario] ?? scenario;
  const server = http.createServer((req, res) => {
    const file = path.join(DIST, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1' } : undefined });
  const page = await browser.newPage({ viewport: { width: Number(widthArg), height: Number(heightArg) }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.exposeFunction('__api', (path) => api(path));
  await page.addInitScript(({ st, game, premades, plan, ranks, post, me, clientTeams, match, dash }) => {
    try {
      localStorage.setItem('rift.groupMemory.v1', JSON.stringify({ 'inimigo meio#br1|inimigo topo#br1': { n: 3, g: 'BR1_1', t: Date.now() } }));
      // Fim de jogo: um duo no seu time (você + o primeiro aliado) e um trio inimigo, como se vistos ao vivo.
      if (post) {
        const meP = post.players.find((p) => p.isMe);
        const mine = post.players.filter((p) => p.teamId === meP.teamId);
        const theirs = post.players.filter((p) => p.teamId !== meP.teamId);
        const duo = [meP, mine.find((p) => !p.isMe)].map((p) => p.riotId.toLowerCase());
        const trio = theirs.slice(1, 4).map((p) => p.riotId.toLowerCase());
        localStorage.setItem('rift.parties.v1', JSON.stringify({ [`BR1_${post.gameId}`]: { at: Date.now(), groups: [duo, trio] } }));
      }
    } catch {}
    const empty = () => { const p = Promise.resolve([]); return Object.assign(() => {}, { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) }); };
    const bridge = (impl) => new Proxy(impl, { get: (t, k) => (k in t ? t[k] : () => empty()) });
    const q = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    window.lcu = bridge({ getState: async () => st, onState: () => () => {} });
    window.riot = bridge({
      getLiveGame: async () => { if (st.gameflowPhase !== 'InProgress') throw new Error('Você não está em partida.'); return game; },
      getPremades: async () => premades, getLocalGame: async () => null, getLiveDashboard: async () => dash,
      getClientTeams: async () => (st.gameflowPhase === 'InProgress' ? clientTeams : null),
      getPlan: async () => plan, getPostGame: async () => post, onPostGame: () => () => {},
      getSettings: async () => ({ platformId: 'BR1' }),
      findPlayer: async (n, t) => { const r = await window.__api(`/v1/players/BR1/${encodeURIComponent(n)}/${encodeURIComponent(t)}`); if (!r) throw new Error('Jogador não encontrado.'); return r; },
      getMatches: async (puuid, _p, start, count) => (await window.__api(`/v1/matches/BR1/${puuid}?start=${start}&count=${count}`)) ?? [],
      getCoach: async () => ({ timeline: { csDiff10: -6, goldDiff10: -310, csDiff14: -11, goldDiff14: null, deathsBefore10: 1, firstDeathMin: 7, laneOpponentChampion: null },
        narration: 'Partida equilibrada: seu dano ficou acima da sua média, mas o farm caiu no início. Dica: priorize os campos entre os ganks até o nível 6.' }),
    });
    window.stats = bridge({
      meta: () => window.__api('/v1/stats/meta'),
      tierList: (pos) => window.__api('/v1/stats/tierlist' + (pos ? `?position=${pos}` : '')),
      champion: (id, pos, vs, dmg) => window.__api(`/v1/stats/champion/${id}?` + q({ position: pos, vs, damage: dmg })),
      counters: (id, pos) => window.__api(`/v1/stats/counters/${id}?` + q({ position: pos })),
      damage: () => window.__api('/v1/stats/damage'),
    });
    window.app = bridge({
      getPreferences: async () => ({ matchMode: match, matchModeWindow: true, autoAccept: true, appearOffline: false, invisibleStatus: 'offline', invisibleStartupStatus: 'last', invisibleLobbyChat: true, autoNavigate: false, autoRunes: false, minimizeToTray: true, startWithWindows: false, showAsRiftUser: false, chatObjectiveAlerts: true, sendErrorReports: true, detailedDiagnostics: true, telegramReadyCheck: true, telegramChampion: true, telegramGameStart: true, telegramGameEnd: true }),
      info: async () => ({ version: '1.12.0', buildsDirectory: 'C:\\Users\\mathe\\AppData\\Roaming\\Rift Companion\\builds' }),
      updateStatus: async () => ({ state: 'idle' }), gameWindowMode: async () => 'borderless', rankHistory: async () => ranks,
      onRankUpdated: () => () => {}, onAutoAccepted: () => () => {}, onPreferencesChanged: () => () => {}, onAutoRunesApplied: () => () => {}, onUpdateStatus: () => () => {},
    });
    window.builds = bridge({ get: async () => ({ mapId: 11, runePages: [], itemBuilds: [], buildsDirectory: '' }) });
    for (const name of ['lobby', 'telegram', 'mobile', 'riftUsers', 'champSelect']) window[name] = bridge({});
    
  }, { st, game: liveGame(), premades, plan, ranks: rankHistory(), post, me: ME, clientTeams, match: process.env.SIM_MATCH === '1',
    // SIM_DASHBOARD=arquivo.json: dados do jogo (timers, objetivos) para a aba Ao vivo e o topo do modo partida.
    dash: process.env.SIM_DASHBOARD ? JSON.parse(fs.readFileSync(process.env.SIM_DASHBOARD, 'utf8')) : null });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html#view=${view}`);
  await page.waitForTimeout(Number(process.env.WAIT ?? 7000));
  // SIM_CLICK="seletor|seletor": cliques antes da captura (ex.: abrir o menu Organizar).
  for (const sel of (process.env.SIM_CLICK ?? '').split('|').filter(Boolean)) {
    await page.click(sel);
    await page.waitForTimeout(400);
  }
  const target = selector ? await page.$(selector) : null;
  await (target ?? page).screenshot({ path: out, fullPage: !selector && process.env.FULL === '1' });
  const metrics = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, title: document.querySelector('h1,h2')?.textContent?.trim() }));
  console.log(JSON.stringify({ scenario, ...metrics, errors: errors.slice(0, 6) }));
  await browser.close();
  server.close();
})();
