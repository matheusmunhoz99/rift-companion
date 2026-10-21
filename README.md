<p align="center">
  <strong>Português</strong> · <a href="README.en.md">English</a> · <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img src="assets/icon.png" width="110" alt="Ícone do Rift Companion" />
</p>

<h1 align="center">Rift Companion</h1>

<p align="center">
  <strong>O app gratuito que sabe contra quem você joga e te diz o que comprar.</strong><br />
  Build certa para cada confronto, runas e feitiços em 1 clique, raio-x de todos os jogadores,<br />
  overlay em tempo real, modo invisível completo e o seu LoL inteiro no Telegram.
</p>

<p align="center">
  <img alt="Windows 10 e 11" src="https://img.shields.io/badge/Windows-10%20e%2011-0b0d12?style=flat-square" />
  <img alt="Grátis" src="https://img.shields.io/badge/pre%C3%A7o-gr%C3%A1tis-2fbf71?style=flat-square" />
  <img alt="Sem anúncios" src="https://img.shields.io/badge/an%C3%BAncios-zero-2fbf71?style=flat-square" />
  <img alt="Sem injeção" src="https://img.shields.io/badge/inje%C3%A7%C3%A3o-nenhuma-2fbf71?style=flat-square" />
  <img alt="Dados Mestre+" src="https://img.shields.io/badge/dados-Mestre%2B%20BR%20%C2%B7%20EUW%20%C2%B7%20KR-e84057?style=flat-square" />
  <img alt="Beta" src="https://img.shields.io/badge/status-beta-ffb35c?style=flat-square" />
  <a href="LICENSE"><img alt="Todos os direitos reservados" src="https://img.shields.io/badge/c%C3%B3digo-todos%20os%20direitos%20reservados-8b93a7?style=flat-square" /></a>
</p>

<p align="center">
  <a href="https://rift-api.workscanner.com.br/downloads/RiftCompanion.exe"><img alt="Baixar para Windows" src="https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20Baixar%20para%20Windows-e84057?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyLjQiPjxwYXRoIGQ9Ik0xMiAzVjE0LjVNNyAxMCAxMiAxNSAxNyAxME00IDE2LjVWMjAuNUgyMFYxNi41Ii8+PC9zdmc+" /></a>
  &nbsp;
  <a href="https://matheusmunhoz99.github.io/rift-companion/"><img alt="Site" src="https://img.shields.io/badge/Site-do%20app-181c26?style=for-the-badge" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/live.png" alt="Partida ao vivo no Rift Companion" width="920" />
</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Build por confronto</h3>
      Identifica o seu oponente de rota e o tipo de dano do time inimigo. Mostra os itens, runas e feitiços que <strong>Mestres+ compram naquele confronto</strong>.
    </td>
    <td width="33%" valign="top">
      <h3>Controle pelo Telegram</h3>
      Fila, aceite, ban, pick, troca no ARAM, runas e feitiços — tudo pelo celular, num painel que se atualiza sozinho.
    </td>
    <td width="33%" valign="top">
      <h3>Raio-x de 10 jogadores</h3>
      Elo, maestria, últimas 10, chance de vitória, feitiços com recarga, duos e quem já jogou com você ou contra.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>Overlay na partida</h3>
      KDA, CS e ouro, <strong>diferença para o oponente</strong>, CS contra a média Mestre+, próxima habilidade e timers de todos os objetivos.
    </td>
    <td valign="top">
      <h3>Modo invisível</h3>
      Offline, celular ou online — troque na hora, pela bandeja, pelo chat do LoL ou pelo Telegram. O app reinicia o LoL sozinho pelo proxy.
    </td>
    <td valign="top">
      <h3>Fim de partida</h3>
      Nota de 0 a 10, pódio, gráficos de dano, ouro, CS e visão, e os destaques de cada jogador.
    </td>
  </tr>
</table>

---

## Uma build para cada confronto

Uma build "geral" ignora o que mais importa: **contra quem** você joga. O Rift Companion analisa o confronto na seleção de campeões e durante a partida ao vivo:

- descobre o seu **oponente de rota**, testando a rota mais provável de cada inimigo pelos dados de alto elo;
- lê o **perfil de dano do time inimigo**: maioria mágico, maioria físico ou misto;
- mostra a **build do confronto** e os **itens que jogadores Mestre+ do seu campeão compram a mais** contra aquele tipo de time;
- deduz a **sua rota** pelo seu time quando o jogo não informa;
- mostra os **counters de cada inimigo**: quem vence e quem perde para ele na rota dele, começando pelo seu oponente;
- avisa quando a **composição** está desequilibrada: time quase só físico ou só mágico, sem linha de frente;
- traz o **ritmo Mestre+** do seu campeão: CS, ouro e nível médios aos 5, 10, 15 e 20 minutos para você se comparar em tempo real.

<p align="center">
  <img src="docs/screenshots/champselect.png" alt="Seleção de campeões com build do confronto, composição e counters" width="860" />
</p>

Tudo vem de partidas ranqueadas Solo/Duo de jogadores **Mestre, Grão-Mestre e Desafiante** do **BR, EUW e KR**, sempre no **patch atual**: runas, feitiços, itens iniciais, núcleo na ordem de compra, botas, ordem de habilidades e confrontos.

## O seu LoL no Telegram

Conecte uma vez e controle o cliente pelo celular, de qualquer lugar da casa. É **um painel só**, que se atualiza sozinho conforme o jogo anda — sem encher o chat de mensagens.

| Momento | O que dá para fazer pelo Telegram |
| --- | --- |
| **LoL fechado** | Abrir o LoL (e fechar, com confirmação) |
| **Menu** | Escolher a fila, ligar ou desligar o aceite automático |
| **Sala** | Rotas, os 2 campeões do Jogo Dinâmico (já mostra os que estão salvos), convidar amigos, sair, procurar partida |
| **Fila** | Ver o tempo estimado e cancelar |
| **Partida encontrada** | **Aceitar ou recusar** (toca no celular) |
| **Seleção** | **Banir e escolher** por botão ou digitando o nome de qualquer campeão |
| **ARAM** | Ver o campeão sorteado com a arte, **trocar com o banco** e **rerrolar** |
| **Campeão travado** | Importar **runas Mestre+** e **feitiços** com um toque |
| **Partida** | Aviso no **0:00**, quando os campeões aparecem no Nexus, com KDA, CS e nível |
| **Fim** | Vitória ou derrota com KDA, CS e duração, e **Jogar de novo** |

Só os momentos importantes tocam no celular: partida encontrada, sua vez na seleção, início e resultado. O resto é o mesmo painel sendo editado.

**Como conectar:** no app, vá em **Configurações → Avisos no Telegram → Conectar Telegram** e toque em **Iniciar** no bot. Pronto: o app lembra da conexão, mesmo depois de fechar e abrir. Mande `/painel` a qualquer momento para trazer o painel de volta.

**Privado de verdade:** cada PC conectado recebe um código só dele, ligado ao seu chat. As suas mensagens e os seus botões nunca chegam a outra pessoa, e ninguém controla o seu LoL além de você.

## Raio-x da partida ao vivo

<p align="center">
  <img src="docs/screenshots/players.png" alt="Jogadores da partida ao vivo com elo, maestria, duos e feitiços" width="860" />
</p>

Os dois times aparecem **logo no carregamento**, direto do jogo, sem esperar a Riot liberar a partida.

- **Elo, taxa de vitória, maestria e últimas 10 partidas** de cada jogador. Clique no nome para ver o histórico completo.
- **Feitiços com recarga**: veja os summoner spells de todos os jogadores e acompanhe o tempo de recarga ao vivo.
- **Duos e grupos**: identifica quem está jogando junto (duo, trio ou mais) nos dois times.
- **"Já jogaram com você"**: quem esteve nas suas últimas 10 partidas, no seu time ou contra você, com os campeões e o KDA de cada um.
- **Chance de vitória** baseada no elo, na maestria e no histórico recente dos 10 jogadores.
- A **sua build para esta partida**, já ajustada ao oponente e ao perfil de dano do time inimigo.

## Overlay em tempo real

<p align="center">
  <img src="docs/screenshots/overlay.png" alt="Overlay sobre o jogo" width="920" />
</p>

No modo **sem bordas** (Borderless), o overlay aparece direto sobre o jogo — sem injeção, sem leitura de memória, sem risco para a conta.

- **KDA, CS por minuto e ouro** em tempo real.
- **Diferença para o oponente de rota**: CS, nível e itens lado a lado.
- **CS e ouro contra a média Mestre+** do seu campeão no mesmo minuto da partida.
- **Qual habilidade evoluir** a seguir (baseado na ordem Mestre+).
- **Timers de todos os objetivos**: Dragão, Barão, Arauto/Voidgrub e Inibidores, inclusive na **Partida Rápida (Swiftplay)**.
- Posição ajustável (esquerda, centro, direita) e opacidade nas configurações. Atalho **Ctrl+Shift+O** para mostrar/esconder.

## Fim de partida

Quando a partida acaba, o Rift Companion monta uma análise completa:

- **Nota de 0 a 10** para cada jogador dos dois times, calculada por dano, KDA, CS, visão e participação.
- **Pódio** com os 3 melhores jogadores da partida.
- **Gráficos comparativos**: dano causado, dano recebido, ouro, CS e visão — todos os 10 jogadores lado a lado.
- **Destaques**: quem deu mais dano, quem mais farmou, quem mais participou de abates, maior multikill.

<p align="center">
  <img src="docs/screenshots/postgame.png" alt="Tela de fim de partida" width="860" />
</p>

## Modo invisível

Apareça **offline**, no **celular** ou **online** para os amigos e troque a qualquer momento — pela bandeja, pelas configurações, pelo Telegram ou pelo contato **Rift Companion** que aparece direto no chat do LoL.

- **Chat de sala, seleção e convites enviados continuam funcionando.** Só a sua presença global é filtrada.
- **Contato no chat do LoL**: mande "offline", "celular", "online", "ativar", "desativar" ou "ajuda" direto no chat para o Rift Companion.
- **Reinício automático**: se o LoL foi aberto sem o modo invisível, o app fecha e reabre o Riot Client pelo proxy sozinho — esperando a partida acabar se você estiver jogando.
- **Sem injeção e sem leitura de memória**: o modo invisível é um proxy TLS local que filtra só a presença no chat XMPP. Nenhuma mensagem vai ao servidor do Rift Companion.

Para ativar: **Configurações → Ativar modo invisível**, escolha o status e abra o LoL pelo Rift Companion, pela bandeja ou pelo Telegram.

## Tier list e builds de todos os campeões

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/tierlist.png" alt="Tier list por rota" /><br /><sub>Tier list Mestre+ por rota</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/builds.png" alt="Builds e runas de qualquer campeão" /><br /><sub>Build de qualquer campeão, rota e oponente</sub></td>
  </tr>
</table>

Tier list por rota com taxa de vitória, escolha e banimento, atualizada a cada patch automaticamente. Abra a página de builds de qualquer campeão em qualquer rota, contra qualquer oponente — runas, feitiços, itens, ordem de habilidades e confrontos.

## E tem mais

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/home.png" alt="Tela inicial" /><br /><sub>Tela inicial</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/history.png" alt="Histórico de qualquer jogador" /><br /><sub>Histórico de qualquer jogador</sub></td>
  </tr>
</table>

- **Aceite automático** da fila — sem perder partida por distração.
- **Fila pelo app:** criar sala, escolher rotas (incluindo os campeões do Jogo Dinâmico com as rotas prioritárias), convidar amigos e procurar partida.
- **Histórico de qualquer jogador** pelo Riot ID: elo, maestria, partidas com campeões, KDA e itens.
- **Runas e feitiços em 1 clique**: importa a página de runas Mestre+ e os feitiços direto no cliente — na seleção de campeões ou pelo Telegram.
- Interface **responsiva** para qualquer monitor, ícones próprios, bandeja do sistema, iniciar com o Windows e **atualização automática**.
- **Dados sempre atuais**: a tier list e o Data Dragon se atualizam sozinhos quando sai um patch novo.

## Como instalar

1. Baixe o **[RiftCompanion.exe](https://rift-api.workscanner.com.br/downloads/RiftCompanion.exe)** (Windows 10 ou 11, ~100 MB). Esse link sempre baixa a versão mais nova.
2. Abra o arquivo. Ele roda direto, sem instalador.
3. Abra o LoL. O app conecta sozinho e se atualiza sozinho.

> **O Windows mostrou "O Windows protegeu o computador"?** Esse aviso aparece com apps novos que ainda não têm reputação na Microsoft. Clique em **Mais informações → Executar assim mesmo**. O código é aberto e está todo aqui.

## Como funciona

```
                         ┌──────────────────────────────┐
  Telegram  ◄──────────► │ rift-api (nosso servidor)    │ ◄──────► Riot API
  (seu celular)          │ chave da Riot, bot, cache,    │
                         │ estatísticas Mestre+          │
                         └──────────────▲───────────────┘
                                        │ HTTPS
                         ┌──────────────┴───────────────┐
                         │ Rift Companion (seu PC)       │
                         │ Electron + Angular            │
                         └──────┬───────────────┬────────┘
                                │ API do cliente │ Live Client Data API
                                ▼               ▼
                         Cliente do LoL      Jogo (só leitura)
```

- **API do cliente do LoL (LCU)** e **Live Client Data API**: só no seu PC.
- **Modo invisível**: um proxy TLS local filtra somente a presença global do chat XMPP. Mensagens e presenças de sala passam intactas; nenhum dado do chat vai ao servidor do Rift Companion.
- **Riot API** (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5): **só pelo nosso servidor**. A chave nunca vai junto com o app.
- **Bot do Telegram**: o token do bot também fica só no servidor.

## Jogo limpo

O Rift Companion segue as [políticas para desenvolvedores](https://developer.riotgames.com/policies/general) da Riot:

- **Sem injeção, leitura de memória ou alteração de arquivos do jogo.** O overlay é uma janela separada.
- O modo invisível inicia o Riot Client com uma configuração de chat local e filtra a presença no processo do Rift Companion; ele não modifica nem injeta código no cliente.
- **Sem informação escondida:** nada de timers da selva inimiga ou do que está na névoa de guerra.
- **Sem automação de jogabilidade:** só facilidades do cliente que você liga (fila, seleção, runas).

## Privacidade

Sem contas, sem senhas e sem anúncios. O servidor guarda só estatísticas agregadas, cache temporário e, se você conectar o Telegram, o código do seu chat. Detalhes em [PRIVACY.md](PRIVACY.md) (em inglês).

## Desenvolvimento

Requisitos: Node.js 24+, Windows 10/11 e o cliente do League of Legends.

```bash
npm install
npm --prefix renderer install
npm start
```

| Comando | O que faz |
| --- | --- |
| `npm run build` | Compila o processo principal e a interface |
| `npm test` | Roda os testes |
| `npm run dist` | Gera o executável portátil em `release/` |

Pastas: `electron/` (processo principal, cliente do LoL, Telegram, overlay), `renderer/` (interface Angular) e `docs/ARQUITETURA.md` (notas técnicas). O servidor (rift-api: Riot API, bot do Telegram e estatísticas) fica num repositório privado.

Sugestões e problemas: [abra uma issue](https://github.com/matheusmunhoz99/rift-companion/issues).

## Créditos

O modo invisível usa o mesmo mecanismo de proxy local popularizado pelo projeto open source [Deceive](https://github.com/molenzwiebel/Deceive) e o certificado de localhost publicado por ele. A implementação do Rift Companion é em TypeScript e integrada ao seu próprio processo Electron.

## Direitos autorais

**© 2026 Matheus Munhoz. Todos os direitos reservados.** O código está aberto para consulta, para qualquer pessoa conferir que o app é seguro, mas **não pode ser copiado, modificado, redistribuído nem usado em outros projetos** sem autorização por escrito. O nome, o logo e os ícones do Rift Companion também são protegidos. Detalhes em [LICENSE](LICENSE).

Para usar o app, baixe sempre pelos canais oficiais: o [site](https://matheusmunhoz99.github.io/rift-companion/) e este repositório. Como os dados pessoais são tratados: [Política de privacidade](PRIVACY.md).

## Aviso legal

O Rift Companion não é endossado pela Riot Games e não reflete as opiniões da Riot Games ou de qualquer pessoa oficialmente envolvida na produção ou gestão de propriedades da Riot Games. Riot Games e todas as propriedades associadas são marcas comerciais ou marcas registradas da Riot Games, Inc.
