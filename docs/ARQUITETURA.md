# Rift Companion — arquitetura

Documentação técnica (em português) dos módulos do app.

## Estrutura

- `electron/`: processo principal (Node).
  - `lcu/credentials.ts`: acha porta e senha da API local do cliente (linha de comando do `LeagueClientUx.exe` ou `lockfile`).
  - `lcu/http.ts`: requisições HTTPS ao cliente (`https://127.0.0.1:<porta>`).
  - `lcu/socket.ts`: WebSocket WAMP com os eventos em tempo real do cliente.
  - `lcu/connector.ts`: reconexão automática e estado (conta, fase, seleção de campeões).
- `renderer/`: interface Angular, que recebe o estado via `window.lcu` (preload).

## Interface (design system)

Direção "transmissão de partida": o app fica ao lado do jogo, então os números são protagonistas e o resto é calmo. Os tokens ficam em `renderer/src/styles.scss`; as telas usam só as variáveis.

- **Superfícies:** `--bg` (fundo azul-ardósia) → `--surface` (painel) → `--surface-2`/`--surface-3` (elevado, trilho de controles) e `--well` (poço rebaixado para listas). A hierarquia vem do tom; a borda é fina e o painel tem um fio de luz no topo (`--highlight`).
- **Cores com significado fixo:** `--accent` (brasa, do logo) só para destaque e ação principal, com texto `--accent-ink` (escuro, 6,7:1). Azul (`--ally`/`--win`) = aliado/vitória; vermelho (`--enemy`/`--loss`/`--danger`) = inimigo/derrota/erro. Textos `--text`, `--muted` e `--faint` passam de 4,5:1 sobre o painel.
- **Tipografia:** Barlow para texto e Barlow Semi Condensed (`--font-display`, classe `.num`) para títulos e números de placar, embutidas em `renderer/src/fonts/` (a CSP não permite fontes externas; licença OFL em `public/fonts/OFL.txt`). Algarismos tabulares no app inteiro. Rótulos em frase normal, sem caixa alta.
- **Forma:** raio cresce com a hierarquia (`--radius` 14px painel, `--radius-sm` 8px controle, chips redondos).
- **Componentes globais:** `.card`, `.well`, `.section-title`, `.btn` (`ghost`, `danger`, `small`, `big`), `.input`, `.chip`, `.empty-state`, `.skeleton`.
- **Movimento:** `--dur-fast`/`--dur`/`--dur-slow` com `--ease-out` e `--ease-spring`, só em resposta ao usuário ou para mostrar o que mudou (troca de tela, modal, toasts, interruptores). Com "reduzir movimento" do Windows, tudo fica instantâneo.
- **Estrutura:** barra lateral em dois grupos (fluxo da partida e consultas) com entalhe de brasa no item ativo; a barra de título mostra a fase do jogo ao vivo (fila com tempo, seleção, partida com o relógio) e leva à tela certa.

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

## Modo invisível

Com `appearOffline` ligado, o LoL deve ser aberto pelo Rift Companion. O app:

1. reutiliza o PFX válido de `deceive-localhost.molenzwiebel.xyz`, renovando quando faltam até 20 dias;
2. abre um proxy HTTP em loopback do `clientconfig` (upstream HTTPS) e um proxy TLS local do chat;
3. inicia `RiotClientServices.exe` com `--client-config-url=http://127.0.0.1:<porta>`;
4. troca `chat.host`, `chat.port` e todas as afinidades pelo proxy local, conservando o servidor regional real;
5. no fluxo XMPP cliente → Riot, reescreve somente as presenças globais conforme o status (`electron/invisible/presence.ts`):
   - **offline**: esvazia `games`, remove `status` e envia `show=offline`;
   - **celular**: conserva só `league_of_legends` sem `p`, `m` e `pd` (fila, partida, grupo), com `st` e `show` iguais a `mobile`;
   - **online** (ou modo desativado): a presença original passa intacta.

Trocar o status reenvia a última presença global já reescrita, sem reiniciar nada. As preferências `invisibleStatus`, `invisibleStartupStatus` (status ao abrir o LoL ou "lembrar o último") e `invisibleLobbyChat` seguem o Deceive. Com o chat de sala desligado e o status oculto, presenças com `to` (lobby, seleção) também são retidas; ligado, elas passam sem alteração.

No sentido Riot → cliente (`electron/invisible/roster.ts`), o primeiro resultado do roster recebe o contato local **Rift Companion**. A presença dele mostra o seu status atual. As mensagens dele (boas-vindas na primeira vez, saudação por sessão e aviso de cada troca) só entram entre stanzas completas. Tudo que o cliente envia para esse JID fica retido no proxy; o texto vira comando (`offline`, `celular`, `online`, `ativar`, `desativar`, `sala`, `status`, `ajuda`). Se o XML do servidor fugir do formato esperado, o fluxo passa a ser repassado sem filtro e o contato fica inativo naquela conexão.

**LoL aberto sem o proxy:** ao ligar o modo invisível, ao conectar num cliente aberto por fora com o modo ligado, ou ao pedir "Abrir LoL" com um Riot Client que não passa pelo proxy, o app pergunta uma vez e reinicia sozinho: pede ao cliente para sair (`/process-control/v1/process/quit`), encerra o que sobrou do LoL e do Riot Client (o jogo nunca) e abre de novo com `--client-config-url`. Para saber se o Riot Client já passa pelo proxy, usa a linha de comando quando o Windows mostra; sem ela, para onde está ligada a conexão de chat do `RiotClientServices.exe` (proxy local = invisível; porta 5223 da Riot = não). Sem nenhum dos dois sinais, espera até 45 s pelo chat antes de concluir. Na fila, na seleção e na partida nada é fechado: o reinício fica pendente e acontece quando a partida acaba. Pelo Telegram, "Abrir" reinicia sem perguntar.

O proxy não envia conversas ao backend do Rift Companion. O diagnóstico vai para `%APPDATA%\Rift Companion\invisible\debug.log`, sem autenticação nem mensagens; a cada inicialização do proxy o anterior vira `debug.anterior.log`. Um Riot Client que já estava aberto precisa ser fechado, pois `client-config-url` só é lido na inicialização.

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

## Seleção de campeões: composição e counters

- **Composição** (`champ-select/team-comp.ts`): divisão de dano físico/mágico de cada time pelas notas `info.attack`/`info.magic` do Data Dragon, e quantos jogam na frente (classe Tank, ou Fighter com `info.defense` 6+). Com 3 campeões ou mais de um time aparecem avisos: time quase só físico (até 25% mágico) ou só mágico (70%+), sem linha de frente, inimigo com muita linha de frente. Enquanto você não confirma, o aviso sugere o que falta.
- **Counters** (`champ-select/counter-panel.ts`): para cada inimigo revelado, quem vence e quem perde para ele na rota provável dele (`GET /v1/stats/counters/:id?position=`, confrontos Mestre+ com 20 partidas ou mais). A rota de cada inimigo é deduzida pela distribuição de rotas na coleta, como no painel de build; a aba começa e segue o provável oponente da sua rota até você escolher outra.

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

A tela cabe numa janela de 1320×840 sem rolar: uma barra única (partida, abas Jogadores / Ao vivo / Sua build, chance de vitória) e, em cada aba, o conteúdo em grade.

### Overlay sobre o jogo

Duas linhas: você (KDA, CS por minuto, ouro), a diferença para o inimigo da sua rota (CS, nível e valor dos itens) e a habilidade a evoluir; embaixo, abates, objetivos por time e os próximos objetivos com contagem regressiva. Os timers são os mesmos do painel (`toLiveDashboard` com os tempos da fila), e o relógio anda entre as leituras de 2 s.

A dica de habilidade usa o início e a ordem de maximizar mais jogados do campeão na rota (`skillStart`/`skillOrder` das estatísticas): R nos níveis 6/11/16, as três primeiras pelo início e o resto pela ordem, sem passar de metade do nível numa básica. Só aparece "Evolua" quando sobra ponto (níveis de Q/W/E/R vêm de `activePlayer.abilities`); sem ponto, mostra a ordem. Jayce, Elise, Nidalee, Udyr, Karma e Aphelios ficam de fora (habilidades fora da regra comum).

**Mestre+ (benchmark):** o servidor guarda, pela linha do tempo das partidas coletadas, o CS (tropas + selva), o ouro total e o nível de cada jogador aos 5, 10, 15 e 20 minutos, e devolve a média do campeão na rota em `benchmarks` (`/v1/stats/champion/:id`, 20 partidas por minuto no mínimo). O overlay liga esses pontos com retas (a partir de 0 CS e 500 de ouro) e mostra você menos a referência no minuto atual, até 5 min depois do último medido. O seu ouro total é estimado pelo valor dos itens mais o ouro no bolso (consumíveis gastos e itens vendidos não entram). O painel de build mostra a tabela "Ritmo Mestre+".

### Aba Ao vivo (`electron/overlay/live-dashboard.ts`)

Lê a Live Client Data API (`allgamedata`) a cada 2 s: placar, objetivos por time, rota a rota, mortos, seus atributos e lances. A API não informa dano nem o ouro dos outros: o "ouro" de cada jogador é o valor dos itens comprados (preço total no Data Dragon).

Os timers de objetivos contam até o primeiro surgimento e, depois de cada abate, até o próximo. A API só avisa abates, então os tempos de surgimento são fixos por temporada e por fila:

- **Summoner's Rift (temporada 2026):** Dragão 5:00 (+5:00 por abate; Ancião 6:00 depois da alma de 4), Larvas 8:00 até 14:45, Arauto 15:00 até 19:45, Barão 20:00 (+6:00). Sem Atakhan desde o patch 26.1.
- **Partida Rápida (fila 480):** só 2 dragões (alma com 2), Ancião aos 15:00 e a cada 6:00, Barão 12:00; sem Larvas, Arauto e Atakhan.

Os mesmos valores ficam em `scripts/timers.json` (`default` + `queues` por id da fila; surgimento 0 tira o objetivo do modo), publicado em `downloads/timers.json` pelo `npm run release`. O app relê o arquivo a cada hora e usa os embutidos se ele não carregar, então uma mudança de temporada se corrige sem nova versão. A fila vem da sessão do cliente (`/lol-gameflow/v1/session`).

## Fim de partida (`electron/lcu/postgame.ts`, `renderer/src/app/postgame/`)

Quando a fase vira `PreEndOfGame`/`EndOfGame`, o app lê o placar que o próprio cliente monta (`/lol-end-of-game/v1/eog-stats-block`), tentando de novo por até 30 s até ele vir preenchido. O placar traz o que o match-v5 não tem (dano recebido, mitigado, cura) e chega na hora. A última partida fica em `%APPDATA%\Rift Companion\postgame\last.json`; o original do cliente vai para `last-raw.json`, para ajustar o leitor se o formato mudar.

A tela "Partida ao vivo", fora de partida, mostra o resultado, o pódio dos 3 melhores, o ranking de 1 a 10, um gráfico por estatística (dano, dano recebido, mitigado, ouro, CS, visão, cura, estruturas), a divisão do dano de cada time e os destaques. O app abre essa tela sozinho no fim da partida (com "abrir telas automaticamente").

**Nota (0 a 10):** cada estatística vale pela fração do melhor valor entre os 10 jogadores, com pesos: participação em abates 20%, dano a campeões 20%, KDA 16%, ouro 10%, visão 10%, dano recebido + mitigado 9%, CS 6%, estruturas 5%, vitória 4%, e mortes descontam 12%. O total é escalado para o melhor da partida ficar com 10. Não depende da rota: quem segura dano ou dá visão também pontua.

## Sempre no patch atual

- **Estatísticas** (builds, winrate, counters, tier list, ritmo Mestre+): o servidor consulta o banco a cada pedido, sem cache, só no patch mais novo coletado; enquanto ele tem menos de 2.000 partidas, soma o anterior. Partidas de patch mais antigo que o Data Dragon são descartadas, e as de um patch que ainda não chegou ao Data Dragon já entram.
- **Data Dragon** (campeões, itens, preços, runas, habilidades): o app usa sempre a versão mais nova e confere a cada 3 h se saiu outra (2 min depois, se estava sem internet).
- **Tier list para deduzir rotas**: renovada a cada 30 min. Painéis de build e counters buscam a cada abertura; o overlay, uma vez por partida.
- **Runas recomendadas do cliente** e **timers de objetivos** (`timers.json`, relido a cada hora) não dependem de versão do app.

## Servidor

O servidor (rift-api) fica num repositório privado: proxy da Riot API com cache, bot do Telegram e
coletor de estatísticas Mestre+. O app só conhece as rotas públicas dele em
`https://rift-api.workscanner.com.br`; a chave da Riot e o token do bot nunca saem do servidor.

## Registro do app

`%APPDATA%\Rift Companion\logs\app.log` (até 1 MB, depois vira `app.anterior.log`): abertura com a versão, conexão com o cliente e cada fase do jogo, chat conectado pelo proxy, atualização pedida, erros não tratados e fechamento. Nada de senhas, tokens ou conversas.

Durante a partida, as leituras da API do jogo (overlay, painel ao vivo, avisos do Telegram) são divididas: pedidos com menos de 1 s de diferença recebem a mesma resposta. Com o LoL fechado, o app procura o cliente pelo `lockfile` (só lê um arquivo) e abre o PowerShell para achar o processo no máximo a cada 10 s.

## Atualização automática

O app confere `/downloads/latest.json` ao abrir e a cada 6 h. Ao atualizar, baixa o .exe novo para a
pasta do .exe atual, confere tamanho e SHA-256, abre a versão nova e fecha (a nova assume pela troca
de versão da instância única). Na seleção de campeões e na partida, "Atualizar agora" fica bloqueado, porque reiniciar o app derrubaria o chat do modo invisível. Para publicar:

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
