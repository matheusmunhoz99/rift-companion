// Isolated visual smoke-test harness. Never used by a packaged app.
const mode = process.env.RIFT_PHONE_PREVIEW || 'unlinked';
const prefs = { autoAccept:false, autoRunes:false, autoNavigate:true, appearOffline:false, invisibleStatus:'offline', invisibleStartupStatus:'last', invisibleLobbyChat:true, overlayEnabled:true, overlayPosition:'center', overlayOpacity:0.9, minimizeToTray:true, startWithWindows:false, telegramReadyCheck:true, telegramChampion:true, telegramGameStart:true, telegramGameEnd:true };
const lcu = { status:'connected', summoner:{ puuid:'preview', summonerId:1, gameName:'Invocador', tagLine:'BR1', summonerLevel:100, profileIconId:29 }, gameflowPhase:'None', champSelect:null, platformId:'BR1', lobby:null, search:null, readyCheck:null };
window.CapacitorCustomPlatform = { name:'android' };
window.Capacitor = {
  PluginHeaders: [
    { name:'RiftCredentials', methods:['get','set','remove'].map(name => ({name,rtype:'promise'})) },
    { name:'CapacitorHttp', methods:[{name:'request',rtype:'promise'}] },
  ],
  nativePromise: async (plugin, method, options) => {
    if (plugin === 'RiftCredentials') return mode === 'unlinked' ? {} : {token:'a'.repeat(64)};
    if (plugin !== 'CapacitorHttp') throw new Error('Unexpected plugin');
    const endpoint = options.url.split('/').pop();
    if (endpoint === 'state') return {status:200,data:{ approved:true,online:true,data:{ lcu,prefs,postgame:null,info:{version:'0.5.0-beta.13',overlayShortcut:'Ctrl+Shift+O',buildsDirectory:''} } }};
    const body = options.data;
    const values = {
      'riot:get-settings':{platformId:'BR1',platforms:[{id:'BR1',label:'Brasil'}]},
      'stats:meta':{patches:['16.21'],matches:15000,players:2000,region:'BR, EUW e KR',tiers:'Mestre+',queue:'Ranqueada Solo/Duo'},
      'stats:tierlist':[], 'lobby:queues':[], 'telegram:status':{connected:false}, 'app:game-window-mode':'borderless',
    };
    return {status:200,data:{value:values[body?.channel] ?? null}};
  },
};
