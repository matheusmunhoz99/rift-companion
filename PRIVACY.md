# Privacy Policy

_Last updated: October 19, 2026_

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

## Telegram (optional)

If you connect Telegram in the app's settings, our server stores:

- your **Telegram chat ID** and a random code that identifies your PC, so notices go only to your chat and buttons you tap reach only your PC;
- the ID of the panel message, so the bot can update it instead of sending new messages;
- button taps and champion names you type, only until your PC picks them up (at most one minute).

Messages you type to the bot are deleted from the chat after they are read. Send `/parar` to the bot or click "Desconectar" in the app to remove the link. The bot token is kept only on our server.

## Updates

The app checks our server for new versions. This request does not include any personal data.

## Contact

Questions or removal requests: open an issue in this repository.

Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
