# Rift Companion — arquitetura

Documentação técnica (em português) dos módulos do app.

## Estrutura

- `electron/`: processo principal (Node).
  - `lcu/credentials.ts`: acha porta e senha da API local do cliente (linha de comando do `LeagueClientUx.exe` ou `lockfile`).
  - `lcu/http.ts`: requisições HTTPS ao cliente (`https://127.0.0.1:<porta>`).
  - `lcu/socket.ts`: WebSocket WAMP com os eventos em tempo real do cliente.
  - `lcu/connector.ts`: reconexão automática e estado (conta, fase, seleção de campeões).
- `renderer/`: interface Angular, que recebe o estado via `window.lcu` (preload).

## Jogar (sala e fila)

Aba Jogar: lista as filas disponíveis (`/lol-game-queues/v1/queues`, sem TFT, tutoriais e Clash),
cria a sala (`POST /lol-lobby/v2/lobby`), escolhe rotas (`position-preferences`) ou, no Jogo Dinâmico,
os dois campeões com rota (`/lol-lobby/v1/lobby/members/localMember/player-slots`, com runas e feitiços
recomendados), convida amigos (`/lol-chat/v1/friends` + `/lol-lobby/v2/lobby/invitations`) e
inicia/cancela a busca. A janela "Partida encontrada" permite aceitar ou recusar pelo app.
O nome dos membros vem de `/lol-summoner/v2/summoners/puuid/:puuid` (o cliente não envia mais no lobby).

## Aceite automático

Botão na aba Cliente (salvo em `settings.json`). Ao receber o evento
`/lol-matchmaking/v1/ready-check` em andamento e sem resposta do jogador, o app envia
`POST /lol-matchmaking/v1/ready-check/accept`. Se você recusar manualmente, nada é enviado.

## Builds

- Runas: páginas recomendadas pelo próprio cliente (`/lol-perks/v1/recommended-pages/...`).
  A importação usa uma página com prefixo `Rift: `: reaproveita a existente, cria uma nova
  se houver espaço ou, em último caso, grava sobre a página atual.
- Feitiços: aplicados junto com as runas na seleção de campeões, mantendo cada feitiço na tecla que você já usa.
- Itens: arquivos JSON em `builds/` (exemplos) e na pasta `builds` dos dados do app
  (`%APPDATA%\rift-companion\builds`), que tem prioridade. São salvos como conjunto de itens
  da conta (`/lol-item-sets`) associado ao campeão.

```json
{
  "championId": 222,
  "position": "bottom",
  "title": "Jinx - Crítico",
  "maps": [11],
  "blocks": [{ "name": "Inicial", "items": [1055, 2003, 3340] }]
}
```

`position`: `top`, `jungle`, `middle`, `bottom` ou `utility`. IDs de itens e campeões estão no Data Dragon.

## Histórico (Riot API)

O app não tem chave da Riot. Ele chama o servidor (rift-api) em `https://rift-api.workscanner.com.br`,
que guarda a chave e faz cache (em desenvolvimento, `RIFT_API_URL` troca o endereço).

- `GET /v1/players/:plataforma/:nome/:tag`: conta (`account-v1`), nível e ícone (`summoner-v4`) e elo (`league-v4`).
- `GET /v1/matches/:plataforma/:puuid?start=0&count=10`: partidas (`match-v5`), no máximo 20 por página.
- `GET /v1/live/:plataforma/:nome/:tag`: partida em andamento (`spectator-v5`) com elo e maestria
  de cada jogador; 404 fora de partida. Usa Riot ID porque o PUUID do cliente do LoL não é o PUUID
  criptografado da Riot API. Cache de 2 min por partida, 10 min para elo e 30 min para maestria.

## Partida ao vivo

Ao entrar em partida, a aba Cliente mostra os dois times com Riot ID, campeão, feitiços, runa, elo
(Solo/Duo ou Flex), winrate da temporada e maestria. Clicar num jogador carrega as últimas 10 partidas.
A chance de vitória é uma estimativa simples pela diferença do elo médio dos times (curva logística,
limitada a 10–90%); não é um modelo treinado e não considera campeões nem modo de jogo.
- Em cada partida dá para abrir os 10 jogadores e importar runas, feitiços e itens de qualquer um deles.

## Servidor

O servidor (rift-api) fica num repositório privado: proxy da Riot API com cache, bot do Telegram e
coletor de estatísticas Mestre+. O app só conhece as rotas públicas dele em
`https://rift-api.workscanner.com.br`; a chave da Riot e o token do bot nunca saem do servidor.

## Atualização automática

O app confere `/downloads/latest.json` ao abrir e a cada 6 h. Ao atualizar, baixa o .exe novo para a
pasta do .exe atual, confere tamanho e SHA-256, abre a versão nova e fecha (a nova assume pela troca
de versão da instância única). Para publicar:

```bash
RELEASE_NOTES="Nota 1; Nota 2" npm run release
```

## Testes

- `npm test` (raiz): conversão dos dados do jogo para o overlay e timers.

## Overlay

Posição (esquerda, centro, direita) e opacidade nas Configurações. O app lê `Config/game.cfg`
(`WindowMode`) para avisar quando o jogo está em tela cheia exclusiva, onde o Windows pode esconder o
overlay; em "Sem bordas" ele aparece sempre. A cada atualização a janela reafirma "sempre no topo".

Janela transparente, sempre por cima e que ignora cliques (`electron/overlay/`), alimentada pela
Live Client Data API do jogo (`https://127.0.0.1:2999`). Não injeta nada no processo do jogo.
Funciona com o jogo em modo sem bordas; atalho `Ctrl+Shift+O` para mostrar/ocultar.

## Gerar o .exe (beta)

```bash
npm run dist
```

Gera `release/RiftCompanion-Beta-<versão>.exe` (portátil, Windows x64, sem instalação).
O executável não é assinado: o SmartScreen avisa na primeira execução. `npm run icon` regenera
`build/icon.png`.

Revisão visual no desenvolvimento (ignorado no .exe): `RIFT_VIEW=<tela>`, `RIFT_CAPTURE=<arquivo.png>`,
`RIFT_DEMO_STATE`, `RIFT_DEMO_LIVE` e `RIFT_DEMO_OVERLAY` carregam dados de arquivos e salvam um print.

## Rodar

```bash
npm install
npm --prefix renderer install
npm run dev     # Angular com live reload + Electron
npm start       # build de produção + Electron
```

## Roadmap

1. Conexão com o cliente: feito.
2. Importação de runas, feitiços e itens: feito.
3. Histórico de partidas por Riot ID, com importação da build de uma partida: feito.
4. Backend de agregação de builds por campeão.
5. Tela durante a partida (Live Client API, porta 2999).
