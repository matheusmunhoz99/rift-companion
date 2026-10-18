<p align="center">
  <strong>English</strong> · <a href="README.pt-BR.md">Português</a> · <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img src="assets/icon.png" width="96" alt="Rift Companion icon" />
</p>

<h1 align="center">Rift Companion</h1>

<p align="center">
  A free desktop companion for League of Legends: builds, runes, live game insights and match history,<br />
  powered only by official Riot data.
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%2F11-0b0d12?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-closed%20beta-e84057?style=flat-square" />
  <img alt="Price" src="https://img.shields.io/badge/price-free-2fbf71?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Angular-4a7fd6?style=flat-square" />
</p>

<p align="center">
  <img src="docs/screenshots/live.png" alt="Live game view" width="900" />
</p>

<p align="center"><sub>The app interface is in Portuguese for now.</sub></p>

## Features

### Live game
When a game starts, Rift Companion shows both teams with each player's rank, win rate, champion mastery and recent performance, plus a simple win estimate based on average team rank.

It also tells you **which players were in your own last 10 matches** (on your team or against you), with both champions, both KDAs and the result.

### Builds, runes and tier list
- Most popular rune pages, starting items, core items, boots and skill orders for every champion and role.
- Matchup data: win rates against each lane opponent and builds for specific matchups.
- Tier list by role, updated continuously for the current patch.
- Stats are aggregated from Ranked Solo/Duo games of **Master+ players in BR, EUW and KR**.

<p align="center">
  <img src="docs/screenshots/builds.png" alt="Builds and runes" width="440" />
  <img src="docs/screenshots/tierlist.png" alt="Tier list" width="440" />
</p>

### Champion select
- One click imports runes, summoner spells and an item set into the client.
- Optional automatic import when you lock in a champion.
- ARAM support: bench swaps and rerolls from the app.

### Client tools
- Auto-accept for ready checks.
- Create lobbies, choose positions (including Swiftplay champion slots), invite friends and start the queue from the app.
- Player search by Riot ID with rank, mastery and full match history.
- Optional in-game info bar (KDA, CS, gold, objective timers) using the Live Client Data API.
- System tray, start with Windows and automatic updates.

## How it works

```
┌──────────────────────────┐        ┌────────────────────────┐        ┌───────────┐
│ Rift Companion (desktop) │ HTTPS  │ rift-api (our server)  │ HTTPS  │ Riot API  │
│ Electron + Angular       ├───────►│ keeps the API key,     ├───────►│           │
│                          │        │ rate limits and caches │        └───────────┘
└──────┬────────────┬──────┘        └────────────────────────┘
       │ LCU API    │ Live Client Data API
       ▼            ▼
  League client   Game (127.0.0.1:2999, read-only)
```

- **League Client API (LCU):** account state, lobby, champion select, rune and item set import. Local only.
- **Live Client Data API:** read-only in-game data for the info bar. Local only.
- **Riot API** (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5): accessed **only through our server**. The API key is never shipped with the app.

## Fair play and Riot policies

Rift Companion is built to follow Riot's [developer policies](https://developer.riotgames.com/policies/general) and League of Legends third-party guidelines:

- **No injection, memory reading or game file changes.** The in-game bar is a separate transparent window that never touches the game process. It works with the game in borderless mode.
- **No hidden information.** It shows nothing a player couldn't already see in the client or on public profiles: no enemy jungle timers, no fog-of-war information.
- **No gameplay automation.** Only client conveniences the player turns on (auto-accept, rune import).
- **Key safety:** the Riot API key lives only on the server. User requests take priority over background stats collection, rate limits are enforced per routing value, and responses are cached.

## Privacy

Rift Companion doesn't create accounts, read passwords or collect personal data. See [PRIVACY.md](PRIVACY.md).

## Development

Requirements: Node.js 22+, Windows 10/11 and the League of Legends client.

```bash
npm install
npm --prefix renderer install
npm start
```

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the Electron main process and the Angular renderer |
| `npm test` | Runs the tests |
| `npm run dist` | Creates the portable Windows executable in `release/` |

Project layout:

- `electron/`: main process (LCU connection, champion select, lobby, overlay, updates)
- `renderer/`: Angular interface
- `server/`: `rift-api`, the proxy for the Riot API and the stats collector
- `docs/ARQUITETURA.md`: technical notes (Portuguese)

## Legal

Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
