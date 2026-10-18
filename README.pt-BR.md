<p align="center">
  <a href="README.md">English</a> · <strong>Português</strong> · <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img src="assets/icon.png" width="96" alt="Ícone do Rift Companion" />
</p>

<h1 align="center">Rift Companion</h1>

<p align="center">
  Companion gratuito para League of Legends no PC: builds, runas, informações da partida ao vivo e histórico,<br />
  usando apenas dados oficiais da Riot.
</p>

<p align="center">
  <img alt="Plataforma" src="https://img.shields.io/badge/plataforma-Windows%2010%2F11-0b0d12?style=flat-square" />
  <img alt="Status" src="https://img.shields.io/badge/status-beta%20fechado-e84057?style=flat-square" />
  <img alt="Preço" src="https://img.shields.io/badge/pre%C3%A7o-gr%C3%A1tis-2fbf71?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Angular-4a7fd6?style=flat-square" />
</p>

<p align="center">
  <img src="docs/screenshots/live.png" alt="Partida ao vivo" width="900" />
</p>

## Recursos

### Partida ao vivo
Quando a partida começa, o Rift Companion mostra os dois times com o elo, a taxa de vitórias, a maestria do campeão e o desempenho recente de cada jogador. Também mostra uma estimativa simples de vitória pelo elo médio dos times.

Além disso, avisa **quais jogadores estavam nas suas últimas 10 partidas** (no seu time ou contra você), com os campeões, o KDA de cada um e o resultado.

### Uma build para cada partida
Na seleção de campeões e na partida ao vivo, o Rift Companion descobre o seu **oponente de rota** e o **perfil de dano do time inimigo** (maioria mágico, maioria físico ou misto). Depois mostra a build do confronto e os itens que jogadores Mestre+ do seu campeão compram mais contra esse tipo de time.

### Builds, runas e tier list
- Páginas de runas, itens iniciais, itens principais, botas e ordem de habilidades mais usados para cada campeão e rota.
- Confrontos: taxa de vitórias contra cada oponente de rota e builds para confrontos específicos.
- Tier list por rota, atualizada o tempo todo no patch atual.
- As estatísticas vêm de partidas ranqueadas Solo/Duo de **jogadores Mestre+ do BR, EUW e KR**.

<p align="center">
  <img src="docs/screenshots/builds.png" alt="Builds e runas" width="440" />
  <img src="docs/screenshots/tierlist.png" alt="Tier list" width="440" />
</p>

### Seleção de campeões
- Importa runas, feitiços e conjunto de itens para o cliente com um clique.
- Importação automática opcional ao confirmar o campeão.
- Suporte a ARAM: troca com o banco e rerrolagem pelo app.

### Ferramentas do cliente
- Aceite automático da fila.
- Criar sala, escolher rotas (incluindo os campeões do Jogo Dinâmico), convidar amigos e entrar na fila pelo app.
- Busca de jogador por Riot ID com elo, maestria e histórico completo de partidas.
- Barra opcional durante a partida (KDA, CS, ouro e timers de objetivos) usando a Live Client Data API.
- Ícone na bandeja do sistema, início com o Windows e atualização automática.

## Como funciona

```
┌──────────────────────────┐        ┌─────────────────────────┐        ┌───────────┐
│ Rift Companion (PC)      │ HTTPS  │ rift-api (nosso         │ HTTPS  │ Riot API  │
│ Electron + Angular       ├───────►│ servidor): guarda a     ├───────►│           │
│                          │        │ chave, limita e cacheia │        └───────────┘
└──────┬────────────┬──────┘        └─────────────────────────┘
       │ API LCU    │ Live Client Data API
       ▼            ▼
  Cliente do LoL   Jogo (127.0.0.1:2999, só leitura)
```

- **API do cliente do LoL (LCU):** estado da conta, sala, seleção de campeões e importação de runas e itens. Só local.
- **Live Client Data API:** dados da partida, só leitura, para a barra durante o jogo. Só local.
- **Riot API** (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5): acessada **só pelo nosso servidor**. A chave da API nunca vai junto com o app.

## Jogo limpo e políticas da Riot

O Rift Companion segue as [políticas para desenvolvedores](https://developer.riotgames.com/policies/general) da Riot e as regras de apps de terceiros do League of Legends:

- **Sem injeção, leitura de memória ou alteração de arquivos do jogo.** A barra durante a partida é uma janela transparente separada, que nunca mexe no processo do jogo. Funciona com o jogo no modo sem bordas.
- **Sem informação escondida.** Não mostra nada que o jogador não veria no cliente ou em perfis públicos: nada de timers da selva inimiga nem informação da névoa de guerra.
- **Sem automação de jogabilidade.** Só facilidades do cliente que o próprio jogador liga (aceite automático, importação de runas).
- **Chave protegida:** a chave da Riot API fica só no servidor. As buscas dos usuários têm prioridade sobre a coleta de estatísticas, os limites são respeitados por rota e as respostas ficam em cache.

## Privacidade

O Rift Companion não cria contas, não lê senhas e não coleta dados pessoais. Veja a [PRIVACY.md](PRIVACY.md) (em inglês).

## Desenvolvimento

Requisitos: Node.js 22+, Windows 10/11 e o cliente do League of Legends.

```bash
npm install
npm --prefix renderer install
npm start
```

| Comando | O que faz |
| --- | --- |
| `npm run build` | Compila o processo principal do Electron e a interface Angular |
| `npm test` | Roda os testes |
| `npm run dist` | Gera o executável portátil do Windows em `release/` |

Pastas do projeto:

- `electron/`: processo principal (conexão com o cliente, seleção de campeões, sala, overlay, atualizações)
- `renderer/`: interface Angular
- `server/`: `rift-api`, o proxy da Riot API e o coletor de estatísticas
- `docs/ARQUITETURA.md`: notas técnicas

## Aviso legal

O Rift Companion não é endossado pela Riot Games e não reflete as opiniões da Riot Games ou de qualquer pessoa oficialmente envolvida na produção ou gestão de propriedades da Riot Games. Riot Games e todas as propriedades associadas são marcas comerciais ou marcas registradas da Riot Games, Inc.
