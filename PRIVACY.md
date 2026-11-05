# Privacy Policy

_Last updated: November 4, 2026_

Rift Companion is a free desktop app for League of Legends. This policy explains what data the app uses and what it doesn't.

## What the app does not do

- It does not create accounts or ask for a login.
- It does not read, store or send your Riot password or any other credentials.
- It does not read game memory or change game files.
- It does not show ads or sell personal data.

## Data used on your computer

The app connects to the League of Legends client and game running on your PC through Riot's local APIs (League Client API and Live Client Data API). It uses that data to show your account, lobby, champion select and in-game information. This data stays on your computer.

Your settings (for example, auto-accept and preferred region) are saved in a local file in the app's data folder (`%APPDATA%\Rift Companion`).

## Invisible mode (optional)

When you enable invisible mode and open League through Rift Companion, the app runs a TLS proxy on your own computer. It changes only your global XMPP presence; room/champion-select presence and chat messages pass through unchanged. Chat contents are not stored and are not sent to the Rift Companion server.

To establish that local TLS connection, the app downloads and caches the public localhost certificate used by the open-source [Deceive](https://github.com/molenzwiebel/Deceive) project from `mln.cx`. That download exposes the usual connection metadata (such as IP address and time) to that service, but sends no Riot ID, account information or chat contents.

## Data sent to our server

Requests for Riot API data go through our server (`rift-api.workscanner.com.br`), which holds the Riot API key. They include public game data identifiers only: Riot IDs, region and match IDs, for example when you look up a player or open the live game view.

On the server:

- Riot API responses are **cached temporarily** to reduce requests to Riot.
- Build and tier list statistics are stored only as **aggregated numbers** per champion, role and patch, such as games played, wins and item choices. They are not linked to individual players.
- The web server keeps standard access logs (IP address, time and requested path) for security and abuse prevention. They are deleted automatically after 14 days.
- To detect duos and premade groups, the server keeps pairs of public player identifiers (PUUIDs) that played together, for up to 90 days.

## Post-game coach

After a game, the app sends our server the numbers from your game (KDA, CS, gold, vision, damage, duration), your champion, the result and the match ID. The server may add the early-game timeline from the Riot API and asks Anthropic (Claude AI) to write the coaching text. Anthropic receives only a summary with those numbers and the champion name — never your name, Riot ID or account identifier. Nothing from the coach is stored.

## "Show that I use Rift Companion" (optional)

When this setting is on, the app sends a code derived from your Riot ID (never the name itself) so other users see an icon next to your nick. Codes leave the list after 30 days without opening the app, or as soon as you turn the setting off.

## Phone link (optional)

If you link the Android app, our server stores the device name you chose and random pairing codes. The PC app's state is relayed through the server to your phone and is not stored. The link stays until you unlink the device.

## Telegram (optional)

If you connect Telegram in the app's settings, our server stores:

- your **Telegram chat ID** and a random code that identifies your PC, so notices go only to your chat and buttons you tap reach only your PC;
- the ID of the panel message, so the bot can update it instead of sending new messages;
- button taps and champion names you type, only until your PC picks them up (at most one minute).

Messages you type to the bot are deleted from the chat after they are read. Send `/parar` to the bot or click "Desconectar" in the app to remove the link. The bot token is kept only on our server.

## Error reports (optional)

If something crashes, the app sends an anonymous error report to our server: the
error message, the stack trace (with personal paths such as your Windows user
folder removed), the app version and your operating system and architecture. It
never includes your name, Riot ID, Telegram chat or any account data. Reports are
grouped by message and version so we can fix recurring bugs, and are deleted after
30 days. You can turn this off in the app under Settings.

## Detailed diagnostics (optional, off by default)

If you turn on "Diagnóstico detalhado das partidas" in the app's settings, the app helps us
find and fix problems that happen to you. While it is on, it sends our server:

- your Riot ID and a random code created each time the app opens (it identifies that session
  only, not your PC or account);
- what the app did in each game: game phases, requests to our server (route, status, time),
  live game, party (duo/trio) and post-game coach results, and errors, including the Riot IDs
  of players in your games as shown in the app;
- the app's own event log (connections, phases, crashes), which never contains passwords,
  tokens or chat messages;
- the app version and your operating system.

For requests from that session our server also records which Riot API calls it made, their
status and timing. This data is used only to fix bugs, is never sold or shared, and is deleted
automatically after 30 days. Turn the option off at any time to stop sending; to have existing
data deleted sooner, contact us.

## Other services

- **Riot Games:** our server calls the Riot API with the identifiers above. The app loads champion and item images from Riot's Data Dragon.
- **Anthropic:** only for the post-game coach, as described above.
- **Telegram:** only if you connect it.
- **Cloudflare:** network provider that protects and delivers our server.

## Updates

The `.exe` version checks our server for new versions. This request does not include any personal data. The Microsoft Store version is updated by the Store, and uninstalling it removes the app's local data. In the `.exe` version, local data stays in `%APPDATA%\Rift Companion` until you delete it.

## Contact

Questions or data removal requests: use the support contact listed on the Rift Companion page in the Microsoft Store.

A Portuguese version of this policy is available at https://rift-api.workscanner.com.br/downloads/privacidade.html.

Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
