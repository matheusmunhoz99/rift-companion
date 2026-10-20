# Deceive: análise com REA e comparação com Rift Companion

Data: 20/10/2026. Ferramenta executada: REA 6.5.0, comandos públicos
`inspect-managed-artifact` e `inspect-managed-members`.

## Resultado

O Rift Companion implementa o mesmo mecanismo central do Deceive: configuração
local na inicialização do Riot Client, redirecionamento do chat para um proxy TLS
e alteração da presença XMPP. Isso não estabelece equivalência completa de
comportamento. A comparação encontrou diferenças de produto e quatro falhas
reproduzidas no código TypeScript atual.

Esta investigação não iniciou nem encerrou o Riot Client ou o Deceive. Não
observou uma conta de amigo vendo o status offline. As conclusões sobre o
executável são estáticas; os problemas do Rift foram reproduzidos com entradas
sintéticas contra seu código-fonte, transpilado em memória.

## Identidade e evidências

- Executável: `C:\Users\mathe\Downloads\Deceive.exe`.
- Assembly: Deceive 1.18.0.0, .NET Framework 4.7.2, CIL, AnyCPU.
- SHA-256: `25dc5427affed66aa38ec1d9103ffa1a47256dab4e698bef32543fbf0cf3d2e5`.
  Igual ao digest publicado pela API GitHub para o asset da
  [release v1.18.0](https://github.com/molenzwiebel/Deceive/releases/tag/v1.18.0).
- MVID: `0e26d1e4-e479-4087-bb5c-5b5718ccf13c`.
- Fonte comparado: tag v1.18.0, commit
  `ea18a2e2940125db0c8667e95ad81422e9abda42`.
- Identidade REA:
  `ev_ccc5a895cc96379b40683edba7c0a5dd4aab079035bfac4262555360b091fc7c`.
- Membros REA:
  `ev_804d108d61dbac4df057a1ad838f53e87c13a65a21153b1e3f075deec583ab5c`.

O REA reportou cobertura completa de metadados/membros (53 tipos, 219 métodos).
A cobertura separada das strings ficou parcial, com 41 divergências do byte
terminal do heap `#US` em relação à especificação. O texto legível foi preservado.
Isso não prova rejeição pelo runtime nem autoriza alegar cobertura irrestrita.
As chamadas e os literais dos métodos relevantes foram cruzados com o fonte da
tag; não foi feita recompilação para provar igualdade integral entre fonte e binário.

Arquivos locais completos, mantidos em `release/rea-deceive-analysis/` (ignorado
pelo Git):

- `artifact.json`: saída original da identificação.
- `members.json`: saída original dos membros e CIL.
- `focused-evidence.json`: seleção derivada dos métodos relevantes, com tokens,
  hashes, offsets CIL, chamadas e strings.
- `source/`: checkout da tag oficial.
- `probe.cjs` e `probe-results.json`: reprodução dos quatro problemas do Rift.

Os tokens abaixo só identificam métodos neste SHA-256/MVID.

## Funcionamento confirmado

1. `StartupHandler.StartDeceiveAsync`, corpo async `0x060000b9`, inicia o Riot
   Client com `--client-config-url="http://127.0.0.1:PORT"`, produto, patchline e
   `--allow-direct-launch`. Um cliente já aberto precisa reiniciar para receber
   essa configuração.
2. `ConfigProxy.ProxyAndRewriteResponseAsync`, corpo async `0x06000023`, encaminha
   as requisições de configuração à Riot, preserva os cabeçalhos de autorização
   necessários e substitui `chat.host`, `chat.port` e os valores de
   `chat.affinities`. Consulta o PAS quando `chat.affinity.enabled` está ativo
   para escolher o servidor real da região do jogador.
3. `MainController.ServeClientsAsync`, corpo async `0x06000073`, estabelece duas
   conexões TLS: cliente → proxy e proxy → servidor de chat. As chamadas
   `AuthenticateAsServerAsync` e `AuthenticateAsClientAsync` aparecem no CIL.
4. `ProxiedConnection.PossiblyRewriteAndResendPresenceAsync`, corpo async
   `0x060000a3`, usa `XDocument.Load` para analisar XML. Altera `show` e o estado
   do LoL, remove o status e as entradas de jogos conforme o modo. Presenças
   endereçadas a salas passam quando `ConnectToMuc` está habilitado, como é por
   padrão. No modo online, preserva o estado `dnd` do LoL quando já existente.
5. `ProxiedConnection.UpdateStatusAsync`, corpo async `0x060000a9`, reprocessa a
   presença guardada ao mudar o estado. O Deceive também insere o contato local
   “Deceive Active!” na lista de amigos e trata seus comandos dentro do proxy.
6. `Utils.GetProxyCertificateAsync`, corpo async `0x060000cb`, usa o certificado
   de `deceive-localhost.molenzwiebel.xyz`, obtido em
   `https://mln.cx/deceive/localhost.pfx`. Reutiliza o cache quando restam mais de
   20 dias de validade; caso contrário, tenta baixar outro.

Fontes:
[inicialização](https://github.com/molenzwiebel/Deceive/blob/v1.18.0/Deceive/StartupHandler.cs),
[configuração](https://github.com/molenzwiebel/Deceive/blob/v1.18.0/Deceive/ConfigProxy.cs),
[presença](https://github.com/molenzwiebel/Deceive/blob/v1.18.0/Deceive/ProxiedConnection.cs),
[conexões e interface](https://github.com/molenzwiebel/Deceive/blob/v1.18.0/Deceive/MainController.cs),
[certificado](https://github.com/molenzwiebel/Deceive/blob/v1.18.0/Deceive/Utils.cs).

## Problemas reproduzidos no Rift

1. **Presença pode passar sem filtro quando o nome da tag chega fragmentado.**
   `electron/invisible/presence.ts` procura `<presence` apenas no pacote atual
   antes de decidir encaminhá-lo. Dividir a entrada nos offsets 1 a 8 deixou
   passar o status original em todos os oito casos. A reprodução varreu os 128
   cortes possíveis de uma presença sintética. Um fluxo TCP/TLS não garante
   alinhamento com tags XML.
2. **Caracteres UTF-8 podem ser corrompidos.** A conversão individual de pacotes
   por `toString('utf8')` transforma um caractere dividido em substituições.
   Uma presença de sala que deveria passar intacta transformou `ação` em
   `a��ão`.
3. **A presença usada para alternar o modo pode ser a de uma sala.**
   O callback do filtro atualiza `connection.lastPresence` para qualquer
   presença. Após uma global seguida de uma dirigida à sala, guarda a segunda.
   `setOffline` então reenvia a presença da sala, que não altera o status global.
   A atribuição foi reproduzida; o efeito sobre uma conta Riot real não foi
   testado.
4. **A seleção do servidor ignora a flag de afinidade.**
   Com `chat.affinity.enabled=false`, fallback `fallback.example` e afinidade
   `br → affinity.example`, `patchClientConfig` escolheu `affinity.example`.
   O fonte oficial só usa a afinidade quando a flag está habilitada, e o binário
   contém a leitura dessa flag no método de configuração.

Esses resultados não estabelecem que o Deceive seja imune aos mesmos casos.
Seu loop também detecta `<presence` e decodifica UTF-8 por leitura; seu cache
guarda o bloco recebido, que pode conter presenças de sala. Copiar literalmente
esses detalhes não garante robustez de fluxo.

## Diferenças adicionais

Situação na época da análise; os três últimos itens já foram alinhados ao
Deceive (ver a seção seguinte).

- O Rift esvazia todos os jogos; o Deceive remove entradas específicas e trata
  separadamente o modo Mobile.
- O Rift tem alternância offline/normal. Não inclui o modo Mobile, o contato
  fictício nem a opção de desabilitar chat de salas.
- O Rift usava expressões regulares para alterar XML; o Deceive usa um parser.
- O Rift tentava baixar o certificado em cada inicialização do proxy; o Deceive
  consulta primeiro a validade do cache com margem de 20 dias.
- O Rift detectava o cliente aberto pelo PID do lockfile e só considerava
  `rc_default`; o Deceive enumera processos e considera `rc_default`,
  `rc_live` e `rc_beta`.

## Correções aplicadas depois da análise

Os quatro problemas acima foram corrigidos e têm testes em
`test/invisible.test.js` e `test/invisible-proxy.test.js`:

1. `XmppFramer` (`electron/invisible/xmpp.ts`) enquadra o fluxo por bytes e só
   libera stanzas completas; todos os cortes de byte de uma presença global
   saem filtrados.
2. A decodificação UTF-8 acontece por stanza inteira; salas e mensagens passam
   byte a byte intactas.
3. `PresenceStreamFilter` guarda apenas a última presença global para a
   alternância; presenças com `to` não substituem o cache.
4. `patchClientConfig` só usa a afinidade com `chat.affinity.enabled === true`.

A presença agora é analisada com `saxes` em vez de expressões regulares. A
descoberta do Riot Client considera `rc_default`, `rc_live` e `rc_beta`, e o
cliente aberto é detectado pela linha de comando dos processos.

## Próxima validação necessária

Validar a sessão completa com o Riot Client iniciado pelo Rift: login, estado
visto por um amigo, alternância, lobby, seleção, partida e reconexão.
