# Envio para a Microsoft Store

- **Pacote:** `release/RiftCompanion-<versão>.appx`, gerado com `npm run dist:store` (precisa do Windows SDK instalado).
- **Screenshots:** `release/store-listing/01…08-*.png` (1366×869).
- **Política de privacidade:** https://rift-api.workscanner.com.br/downloads/privacidade.html (fonte: `docs/privacidade.html`; em inglês: `PRIVACY.md`).
- **Identidade:** `MatheusMunhoz.RiftCompanion` · `CN=7E66A870-83C4-4ECB-9F96-9178C2D1CF44` · Store ID `9P28NB8F1VHW`.

Cada envio novo precisa de uma versão maior que a anterior (a versão vem do `package.json`).

## 1. Preços e disponibilidade
- Mercados: todos.
- Visibilidade: pública.
- Preço: gratuito.

## 2. Propriedades
- Categoria: **Utilitários e ferramentas**.
- URL da política de privacidade: `https://rift-api.workscanner.com.br/downloads/privacidade.html`
- Contato de suporte: o seu e-mail (a política manda as pessoas para este contato).
- Requisitos do sistema: Windows 10 (1809) ou 11, 64 bits.

## 3. Classificação etária (questionário IARC)
- Tipo de app: **Todos os outros tipos de app** (não é jogo).
- Violência, conteúdo sexual, linguagem, drogas, apostas: **não**.
- Usuários interagem ou trocam conteúdo entre si no app: **não**.
- Compartilha a localização do usuário: **não**.
- Compras digitais: **não**.
- Navegador / acesso irrestrito à internet: **não**.

## 4. Pacotes
Envie o `.appx`. O Partner Center confere se a identidade bate com a do produto.

## 5. Listagem da Store — Português (Brasil)

### Descrição
```
Rift Companion é o app gratuito para League of Legends que sabe contra quem você joga e te diz o que fazer.

Na seleção de campeões, ele mostra a build e as runas certas para o seu confronto e aplica tudo no cliente em um clique. Na partida, faz um raio-x dos 10 jogadores: elo, rota principal, campeões mais jogados, quem está fora da própria rota e quem provavelmente entrou em duo ou grupo. Durante o jogo, acompanha objetivos e timers e dá sugestões com IA. No fim, um coach compara a partida com a sua média e mostra o que você mandou bem e o que dá para melhorar.

Tudo isso com estatísticas de partidas Mestre+ do BR, EUW e KR, histórico e progresso de PDL, avisos pelo Telegram e um app Android para acompanhar pelo celular.

Sem anúncios, sem contas e sem pedir sua senha. O app usa a API oficial da Riot e a API local do próprio cliente do LoL: não lê a memória do jogo nem altera arquivos do jogo.

Requer League of Legends instalado no mesmo computador.

Rift Companion não é endossado pela Riot Games e não reflete as opiniões da Riot Games ou de qualquer pessoa envolvida na produção ou gestão de propriedades da Riot Games. Riot Games e todas as propriedades associadas são marcas comerciais ou marcas registradas da Riot Games, Inc.
```

### O que há de novo nesta versão
```
Versão 1.27.0:
- NOVO Radar Visual do Jungler Inimigo: detecta automaticamente no minimapa (em qualquer resolução, escala ou lado) onde o Jungler inimigo foi visto pela última vez, desenha o rastro no mapa e conta o tempo desde o último avistamento (também no Android).
- Limpeza automática do chat de objetivos: ao fim da partida, apaga os avisos no contato Rift Companion do LoL e zera a notificação não lida.
- Nova tela Jogar redesenhada com convites ao vivo, gráficos pós-jogo minuto a minuto contra o oponente de rota, acervo de 1.000 partidas e alertas de itens críticos inimigos.
```

### Recursos do produto (um por campo)
```
Build, runas e feitiços certos para cada confronto, em 1 clique
Raio-x dos 10 jogadores: elo, rota, campeões e autofill
Detecção de duo e grupo na partida
Painel ao vivo com objetivos e timers
Leitura da partida por IA com sugestões
Coach do fim de jogo: você comparado à sua média
Tier list e estatísticas Mestre+ (BR, EUW e KR)
Histórico, progresso de PDL e aviso de tilt
Aceite automático da fila
Modo invisível no chat
Avisos e controle pelo Telegram
App Android para acompanhar pelo celular
```

### Termos de pesquisa (até 7)
```
League of Legends
LoL
builds
runas
tier list
coach
companion
```

### Outros campos
- Copyright: `© 2026 Matheus Munhoz`
- Screenshots: as 8 de `release/store-listing/`, na ordem dos números.

## 6. Opções de envio

### Funcionalidades restritas — justificativa do `runFullTrust`
```
Rift Companion is a Win32 desktop app (Electron) for League of Legends. It needs runFullTrust to talk to the League of Legends client through the client's local API on localhost, to read the in-game Live Client Data API, and to run the optional local TLS proxy used by invisible mode. It installs no drivers or services, does not read game memory and does not modify game files.
```

### Notas para a certificação
```
The main features (champion select, live game, post-game) need the League of Legends client (Riot Games) installed and logged in on the same PC. Without it, the app shows that it is waiting for the League client; player search, tier list and champion statistics still work. Rift Companion itself has no account or login.
```
