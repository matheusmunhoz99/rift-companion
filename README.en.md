<p align="center">
  <a href="README.md">Português</a> · <strong>English</strong> · <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img src="assets/icon.png" width="110" alt="Rift Companion icon" />
</p>

<h1 align="center">Rift Companion</h1>

<p align="center">
  <strong>Stop guessing. Start winning.</strong><br />
  The free League of Legends companion that knows your opponent, builds for the matchup,
  tracks every player in real time and puts your entire client on your phone.
</p>

<p align="center">
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20and%2011-0b0d12?style=flat-square" />
  <img alt="Free" src="https://img.shields.io/badge/price-free-2fbf71?style=flat-square" />
  <img alt="No ads" src="https://img.shields.io/badge/ads-none-2fbf71?style=flat-square" />
  <img alt="No injection" src="https://img.shields.io/badge/injection-none-2fbf71?style=flat-square" />
  <img alt="Master+ data" src="https://img.shields.io/badge/data-Master%2B%20BR%20%C2%B7%20EUW%20%C2%B7%20KR-e84057?style=flat-square" />
  <img alt="Beta" src="https://img.shields.io/badge/status-beta-ffb35c?style=flat-square" />
  <a href="LICENSE"><img alt="All rights reserved" src="https://img.shields.io/badge/code-all%20rights%20reserved-8b93a7?style=flat-square" /></a>
</p>

<p align="center">
  <a href="https://rift-api.workscanner.com.br/downloads/RiftCompanion.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download%20for%20Windows-e84057?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyLjQiPjxwYXRoIGQ9Ik0xMiAzVjE0LjVNNyAxMCAxMiAxNSAxNyAxME00IDE2LjVWMjAuNUgyMFYxNi41Ii8+PC9zdmc+" /></a>
  &nbsp;
  <a href="https://matheusmunhoz99.github.io/rift-companion/"><img alt="Website" src="https://img.shields.io/badge/App-website-181c26?style=for-the-badge" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/live.png" alt="Live game view in Rift Companion" width="920" />
</p>

<p align="center"><sub>The app interface is in Portuguese for now.</sub></p>

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Matchup-aware builds</h3>
      Identifies your lane opponent, reads the enemy team's damage profile, and shows the exact items Master+ players buy in <em>that</em> matchup.
    </td>
    <td width="33%" valign="top">
      <h3>Your LoL on Telegram</h3>
      Queue up, accept matches, ban and pick champions, swap in ARAM and import runes — all from your phone, in a single self-updating panel.
    </td>
    <td width="33%" valign="top">
      <h3>Full lobby scan</h3>
      Rank, win rate, mastery, last 10 games, duo/trio detection, summoner spell cooldowns and who already played with or against you.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>In-game overlay</h3>
      KDA, CS, gold, lane opponent gap, your CS vs the Master+ average and every objective timer — floating over the game in borderless mode.
    </td>
    <td valign="top">
      <h3>Invisible mode</h3>
      Appear offline, on mobile or online. Switch any time from the tray, settings or the <strong>Rift Companion</strong> contact inside the LoL chat. No injection, no memory reading.
    </td>
    <td valign="top">
      <h3>Post-game breakdown</h3>
      A 0–10 score for every player, a podium, damage and gold charts, and the match highlights — right inside the app.
    </td>
  </tr>
</table>

---

## A build for every matchup

A generic build ignores what matters most: **who you're playing against**. During champion select and the live game, Rift Companion:

- identifies your **lane opponent** by finding each enemy's most likely role from high-elo data;
- reads the **enemy team's damage profile**: mostly magic, mostly physical or mixed;
- shows the **matchup build** and the **items Master+ players of your champion buy more often** against that kind of team;
- infers **your own role** from your team when the game doesn't provide it;
- lists **counters for every enemy**: who beats them and who loses to them in their role, starting with your lane opponent;
- warns when a **team composition** is lopsided: almost all physical or all magic, no frontline;
- shows your champion's **Master+ pace**: average CS, gold and level at the 5, 10, 15 and 20-minute marks.

<p align="center">
  <img src="docs/screenshots/champselect.png" alt="Champion select with matchup build, composition and counters" width="860" />
</p>

All data comes from Ranked Solo/Duo games of **Master, Grandmaster and Challenger** players in **BR, EUW and KR**, always on the **current patch**: runes, summoner spells, starting items, core items in purchase order, boots, skill order and matchups.

## Your League client on Telegram

Connect once and control the client from your phone, anywhere. It's **a single panel** that updates itself as the game progresses — no chat spam.

| When | What you can do from Telegram |
| --- | --- |
| **Client closed** | Open League (and close it, with confirmation) |
| **Main menu** | Pick a queue, toggle auto-accept |
| **Lobby** | Roles, both Swiftplay champions (shows the saved ones), invite friends, leave, find a match |
| **Queue** | Estimated wait time and cancel |
| **Match found** | **Accept or decline** (your phone rings) |
| **Champion select** | **Ban and pick** with a button or by typing any champion name |
| **ARAM** | See your champion's splash art, **swap with the bench** and **reroll** |
| **Champion locked** | Import **Master+ runes** and **summoner spells** in one tap |
| **In game** | Alert at **0:00** when champions spawn, with KDA, CS and level |
| **Game over** | Win or loss with KDA, CS, duration and a **Play again** button |

Only the important moments ring your phone: match found, your turn in champion select, game start and result. Everything else is the same panel being edited in place.

**How to connect:** in the app, go to **Configurações → Avisos no Telegram → Conectar Telegram** and tap **Start** in the bot. The app remembers the connection across restarts. Send `/painel` at any time to bring the panel back.

**Private by design:** each PC gets its own code, tied to your chat. Your messages and buttons never reach anyone else, and nobody but you controls your client.

## Live game scan

<p align="center">
  <img src="docs/screenshots/players.png" alt="Live game players with rank, mastery, duos and spells" width="860" />
</p>

- Both teams appear **as soon as loading starts**, pulled straight from the game. Rank, mastery and win estimate fill in when Riot publishes the match.
- **Rank, win rate, mastery and last 10 games** for every player. Click any name to open their full match history.
- **Duo and trio detection**: see who queued together on both teams.
- **Summoner spell cooldowns**: track enemy Flash and other spell timers live during the match.
- **"Played with you"**: who was in your last 10 games, on your team or against you, with champions and KDAs.
- **Your build for this match**, already tailored to your lane opponent and the enemy damage profile.

## In-game overlay

<p align="center">
  <img src="docs/screenshots/overlay.png" alt="Overlay on top of the game" width="920" />
</p>

A lightweight bar that floats above the game in **borderless windowed** mode — no injection, no DLL, just a separate always-on-top window that ignores clicks.

- **KDA, CS and gold** at a glance.
- **Lane opponent comparison**: CS difference, level difference and item advantage.
- **CS and gold vs the Master+ average** for your champion at the exact same minute — know instantly whether you're ahead or behind the high-elo benchmark.
- **Next ability to level** based on the optimal skill order.
- **Objective timers** for Dragon, Baron, Rift Herald/Voidgrub and Inhibitors, including **Swiftplay** adjusted timers.
- Toggle it on and off with **Ctrl+Shift+O**. Position (left, center, right) and opacity are configurable.

## Post-game breakdown

<p align="center">
  <img src="docs/screenshots/postgame.png" alt="Post-game analysis with scores and charts" width="860" />
</p>

When the game ends, the live tab turns into a full match review:

- A **0 to 10 performance score** for every player, weighted across damage, KDA, vision, CS and objectives.
- **Podium** highlighting the top three performers of the match.
- **Graphs** for damage dealt, damage taken, gold earned, CS and vision score — compare yourself to every player at a glance.
- **Match highlights**: largest multi-kills, structure damage leaders and standout stats.

## Invisible mode

Appear **offline**, **on mobile** or **online** to your friends list — without losing lobby chat, champion select chat or invitations you send.

- **Switch at any time** from the system tray, the settings page or the **Rift Companion** contact that appears inside the LoL chat (type `offline`, `mobile`, `online`, `help` and more).
- **Automatic restart**: if League is already open without the proxy, Rift Companion asks once and then closes and relaunches the client through the invisible proxy. If you're in queue or in a game, it waits until the match is over.
- **No injection and no memory reading.** A local TLS proxy filters only global XMPP presence. Messages, lobby chat and invitations pass through untouched; nothing from your chat ever reaches the Rift Companion server.
- Based on the same mechanism as the open-source [Deceive](https://github.com/molenzwiebel/Deceive) project, reimplemented in TypeScript inside Electron.

To use it: turn on **Configurações → Ativar modo invisível**, pick a status and open League from the Rift Companion button, the tray icon or Telegram. The Riot Client must be fully closed before launching in invisible mode.

## Tier list and champion builds

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/tierlist.png" alt="Tier list by role" /><br /><sub>Master+ tier list by role</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/builds.png" alt="Builds and runes for any champion" /><br /><sub>Build for any champion, role and opponent</sub></td>
  </tr>
</table>

A tier list by role with win rate, pick rate and ban rate, plus a full build page for **any champion in any role, against any opponent**. Runes, spells, items, skill order and matchup stats — all from the current patch.

## And more

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/home.png" alt="Home screen" /><br /><sub>Home screen</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/history.png" alt="Match history for any player" /><br /><sub>Any player's match history</sub></td>
  </tr>
</table>

- **Auto-accept** for ready checks.
- **Queue from the app**: create lobbies, pick roles (including Swiftplay champions with priority roles), invite friends and start the search.
- **Player lookup** by Riot ID: rank, mastery, match history with champions, KDA and items.
- **One-click runes and items**: imports rune pages, summoner spells and full item sets straight into the client — no more copying from external sites.
- A **responsive** interface for any monitor size, custom icons, system tray integration, launch at startup and **automatic updates**.
- **Data Dragon auto-update**: when Riot releases a new patch, champion data and the tier list refresh automatically.

## Install

1. Download **[RiftCompanion.exe](https://rift-api.workscanner.com.br/downloads/RiftCompanion.exe)** (Windows 10 or 11, about 100 MB). This link always serves the latest version.
2. Run the file. It's portable — no installer needed.
3. Open League. The app connects and updates on its own.

> **Windows says "Windows protected your PC"?** That warning appears for new apps that don't have a reputation with Microsoft yet. Click **More info → Run anyway**. The source code is all here.

## How it works

```
                         ┌──────────────────────────────┐
  Telegram  ◄──────────► │ rift-api (our server)         │ ◄──────► Riot API
  (your phone)           │ Riot key, bot, cache,          │
                         │ Master+ stats                  │
                         └──────────────▲───────────────┘
                                        │ HTTPS
                         ┌──────────────┴───────────────┐
                         │ Rift Companion (your PC)      │
                         │ Electron + Angular            │
                         └──────┬───────────────┬────────┘
                                │ Client API     │ Live Client Data API
                                ▼               ▼
                         League client       Game (read-only)
```

- **League Client API (LCU)** and **Live Client Data API**: local to your PC only.
- **Invisible mode**: a local TLS proxy filters only global XMPP presence. Messages and lobby presence pass untouched; no chat data reaches the Rift Companion server.
- **Riot API** (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5): **only through our server**. The key is never shipped with the app.
- **Telegram bot**: the bot token also lives only on the server.

## Fair play

Rift Companion follows Riot's [developer policies](https://developer.riotgames.com/policies/general):

- **No injection, memory reading or game file changes.** The overlay is a separate window.
- The invisible mode launches the Riot Client with a local chat config and filters presence in the Rift Companion process; it does not modify or inject code into the client.
- **No hidden information:** no enemy jungle timers and nothing from the fog of war.
- **No gameplay automation:** only client conveniences you turn on yourself (queue, champion select, runes).

## Privacy

No accounts, no passwords and no ads. The server stores only aggregated stats, a temporary cache and, if you connect Telegram, your chat ID. See [PRIVACY.md](PRIVACY.md).

## Development

Requirements: Node.js 24.21+, Windows 10/11 and the League of Legends client.

```bash
npm install
npm --prefix renderer install
npm start
```

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the main process and the interface |
| `npm test` | Runs the tests |
| `npm run dist` | Creates the portable executable in `release/` |

Folders: `electron/` (main process, League client, Telegram, overlay), `renderer/` (Angular interface) and `docs/ARQUITETURA.md` (technical notes, in Portuguese). The server (rift-api: Riot API, Telegram bot and stats) lives in a private repository.

Suggestions and bugs: [open an issue](https://github.com/matheusmunhoz99/rift-companion/issues).

## Credits

The invisible mode uses the same local proxy mechanism popularized by the open-source [Deceive](https://github.com/molenzwiebel/Deceive) project and its published localhost certificate. Rift Companion's implementation is in TypeScript, integrated into its own Electron process.

## Copyright

**© 2026 Matheus Munhoz. All rights reserved.** The code is open for reference so anyone can verify the app is safe, but it **may not be copied, modified, redistributed or reused in other projects** without written permission. The Rift Companion name, logo and icons are also protected. See [LICENSE](LICENSE).

Always download from the official channels: the [website](https://matheusmunhoz99.github.io/rift-companion/) and this repository. How personal data is handled: [Privacy policy](PRIVACY.md).

## Legal

Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
