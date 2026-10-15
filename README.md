# Rift Companion

App desktop para League of Legends (Electron + Angular), inspirado no Blitz.

## Estrutura

- `electron/`: processo principal (Node).
  - `lcu/credentials.ts`: acha porta e senha da API local do cliente (linha de comando do `LeagueClientUx.exe` ou `lockfile`).
  - `lcu/http.ts`: requisições HTTPS ao cliente (`https://127.0.0.1:<porta>`).
  - `lcu/socket.ts`: WebSocket WAMP com os eventos em tempo real do cliente.
  - `lcu/connector.ts`: reconexão automática e estado (conta, fase, seleção de campeões).
- `renderer/`: interface Angular, que recebe o estado via `window.lcu` (preload).

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

O app não tem chave da Riot. Ele chama o proxy `server/` em `https://rift-api.workscanner.com.br`,
que guarda a chave e faz cache (em desenvolvimento, `RIFT_API_URL` troca o endereço).

- `GET /v1/players/:plataforma/:nome/:tag`: conta (`account-v1`), nível e ícone (`summoner-v4`) e elo (`league-v4`).
- `GET /v1/matches/:plataforma/:puuid?start=0&count=10`: partidas (`match-v5`), no máximo 20 por página.
- Em cada partida dá para abrir os 10 jogadores e importar runas, feitiços e itens de qualquer um deles.

## Servidor (`server/`)

- Node sem dependências de runtime; `npm run build` em `server/` gera `dist/`.
- Variáveis: `RIOT_API_KEY` (obrigatória), `PORT` (3092), `HOST` (127.0.0.1), `CACHE_DIR`,
  `TRUST_PROXY=1` (usa `X-Real-IP` do Nginx para o limite por IP).
- Proteções: 60 buscas/min por IP no app e 5 req/s no Nginx, só GET, validação de entradas;
  erros de chave aparecem só no log do servidor (`journalctl -u rift-api`).
- Deploy na VPS (arquivos em `server/deploy/`):
  - código em `/opt/rift-api`, cache em `/var/lib/rift-api`, chave em `/etc/rift-api.env` (root, 600);
  - serviço `rift-api.service` com usuário próprio e isolamento do systemd;
  - Nginx: `sites-available/rift-api` e `conf.d/rift-api-limits.conf`; certificado
    Let's Encrypt próprio (`--cert-name rift-api.workscanner.com.br`), renovado pelo `certbot.timer`.
- Atualizar o servidor: gerar `dist/`, enviar para `/opt/rift-api` e `systemctl restart rift-api`.
- Remover: `systemctl disable --now rift-api`, apagar os arquivos acima, `certbot delete --cert-name rift-api.workscanner.com.br`, `nginx -t && systemctl reload nginx`.

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
