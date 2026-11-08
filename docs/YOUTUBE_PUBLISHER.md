# YouTube Publisher — plano de integração

Status: documentação e fundação OAuth do backend implementadas na branch. O endpoint MCP remoto ainda não foi implementado; portanto, Claude ainda não consegue descobrir/chamar estas funções. Upload, Analytics e publicação real continuam desativados.

## Objetivo

Receber vídeos finalizados pelo repositório privado `Skill-de-edi-o-e-etc-de-ia-` e oferecer um publicador isolado dentro do Agente AI. O motor de produção continua responsável por roteiro, cena, renderização, áudio, montagem e QA. O Agente AI não duplica essas etapas.

Fluxo pretendido:

```
motor de vídeo
  └─ fila/concluidos/<id>/final/<id>.mp4
       └─ handoff autenticado (arquivo + manifesto)
            └─ Agente AI / YouTube Publisher
                 ├─ valida arquivo e QA
                 ├─ prepara metadados em inglês
                 ├─ solicita aprovação do owner
                 ├─ envia pela YouTube Data API v3 (resumable upload)
                 └─ registra status e URL do vídeo
```

## Limites da primeira entrega

- Não modificar as oito skills nem o orquestrador de produção.
- Não habilitar publicação pública automática.
- Primeiro destino obrigatório: `private`; só permitir `unlisted` em teste explicitamente aprovado.
- Agendamento deve permanecer inativo até o fluxo privado ser validado.
- Não oferecer exclusão de vídeos nem solicitar escopo de exclusão.
- O idioma padrão dos metadados será inglês: `snippet.defaultLanguage = "en"`.
- País de residência do canal não deve ser alterado pela integração.
- Nenhum token, segredo OAuth ou chave deve ser commitado ou enviado ao chat.

## Descoberta do arquivo e handoff

O motor atualmente grava o MP4 em `fila/concluidos/<id>/final/<id>.mp4`, junto com `capa.jpg` e `qa/qa.md`. Esses arquivos ficam no ambiente do motor e não são automaticamente acessíveis ao servidor Agente AI.

O adaptador do motor deverá enviar o arquivo final e um manifesto para um endpoint autenticado do Agente AI. O contrato mínimo do manifesto:

```json
{
  "schemaVersion": 1,
  "productionId": "010_exemplo",
  "videoFileName": "010_exemplo.mp4",
  "contentType": "video/mp4",
  "fileSizeBytes": 12345678,
  "sha256": "hex-sha256",
  "qaStatus": "PASS",
  "qaReportFileName": "qa/qa.md",
  "thumbnailFileName": "capa.jpg"
}
```

O servidor deverá verificar autenticação, tamanho máximo configurado, MIME type, extensão, SHA-256 e resultado de QA antes de aceitar o ativo. O transporte definitivo precisa suportar arquivos grandes; não se deve elevar o limite JSON de 50 MB nem enviar MP4 em JSON/base64. Preferir upload binário/multipart em streaming ou URL de upload temporária com expiração curta.

O caminho local do motor não deve ser presumido como caminho local do servidor Agente AI. O adaptador deve enviar o arquivo ou colocá-lo em armazenamento compartilhado autorizado.

## Google / YouTube OAuth

Configuração necessária no ambiente de hospedagem do Agente AI:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REDIRECT_URI` (HTTPS, rota de callback do publisher)
- `YOUTUBE_TOKEN_ENCRYPTION_KEY` (chave AES-256 em 64 caracteres hexadecimais, exclusiva do ambiente, para criptografia autenticada dos tokens persistidos)\n- `YOUTUBE_OAUTH_STATE_SECRET` (segredo independente com pelo menos 32 bytes para assinar o state OAuth)
- `YOUTUBE_MCP_API_KEY` (credencial independente com pelo menos 32 bytes; Claude envia como `Authorization: Bearer <chave>`)
- `YOUTUBE_PUBLISHING_ENABLED=false` inicialmente
- `YOUTUBE_UPLOAD_VISIBILITY=private` inicialmente
- `YOUTUBE_HANDOFF_SECRET` (segredo independente para autenticar o motor)

Solicitar os escopos OAuth `youtube.upload`, `youtube.readonly` e `yt-analytics.readonly`, necessários respectivamente para envio, identificação/leitura do canal e relatórios de Analytics. Implementar state assinado com expiração, callback HTTPS, armazenamento criptografado de refresh token, renovação de access token, rotação/revogação e logs sem tokens. A autorização deve ser feita pelo proprietário do canal no navegador; nunca pedir senha Google ao usuário.

O projeto Google Cloud deve ter YouTube Data API v3 habilitada e OAuth consent screen configurada. Projetos não verificados podem ter restrições de visibilidade; por isso o fluxo inicial deve aceitar a resposta efetiva da API e nunca prometer publicação pública antes da verificação.

## Upload e publicação

- Usar YouTube Data API v3 `videos.insert` com protocolo de upload resumível.
- Validar título, descrição, tags e categoria antes do envio.
- Metadados e título/descrição em inglês.
- Definir `snippet.defaultLanguage = "en"`.
- Definir `status.privacyStatus = "private"` por padrão.
- Não agendar nem publicar publicamente sem uma aprovação explícita registrada para aquele vídeo.
- Persistir identificador de produção, hash, estado do upload, YouTube video ID, URL, visibilidade e timestamps.
- Implementar idempotência para evitar upload duplicado após timeout/retry.
- Consultar o estado remoto antes de repetir uma operação cujo resultado seja incerto.

## Estados sugeridos

`received → validating → awaiting_approval → uploading → uploaded_private`

Estados de falha: `rejected`, `upload_failed_retryable`, `upload_failed_final`.

O agendamento futuro deve ser uma etapa separada, com data/hora explícita e aprovação independente. Não ativar scheduler até que o upload privado tenha testes de integração concluídos.

## Critérios de aceite

1. Um vídeo com QA PASS é transferido do motor para o Agente AI sem alterar o motor.
2. Hash e tamanho são verificados antes do upload.
3. Arquivo inválido ou QA FAIL é recusado.
4. Sem OAuth válido, o publisher informa desconectado e não tenta publicar.
5. Sem aprovação, nenhum upload é iniciado.
6. Primeiro upload de ponta a ponta termina como privado e devolve URL/ID.
7. Repetir a mesma solicitação não cria um segundo vídeo.
8. Tokens e segredos não aparecem em logs, respostas tRPC, banco em texto puro ou Git.
9. Testes cobrem callback OAuth, state inválido, renovação, falha de rede, retomada e idempotência.

## Pendências externas antes da publicação real

- Criar/configurar projeto Google Cloud e habilitar YouTube Data API v3.
- Configurar tela de consentimento OAuth e URI de callback HTTPS do ambiente publicado.
- Configurar os segredos acima no gerenciador de segredos do host (não no Git).
- Definir o endpoint público HTTPS do Agente AI.
- Implementar o adaptador de handoff no motor e testar transferência de um MP4 real.
- Autorizar o canal correto e executar upload privado de teste.


## Implementação atual na branch

- Helpers de criptografia AES-256-GCM para refresh tokens e assinatura/validação de state OAuth com expiração.
- Configuração e geração do URL de consentimento Google OAuth.
- Troca do authorization code e consulta do canal autorizado.
- Callback HTTPS em `/api/youtube/oauth/callback`.
- Persistência do refresh token criptografado e metadados do canal em `youtube_connections`.
- Endpoints tRPC `youtube.connect` e `youtube.status`, restritos ao perfil owner.
- Ainda não existe endpoint MCP remoto Streamable HTTP; os endpoints atuais são tRPC internos do Agente AI e não são conectáveis diretamente como MCP pelo Claude.\n- Nenhum upload é iniciado nesta etapa. Próximas etapas: implementar o endpoint MCP remoto autenticado, renovar access tokens, receber MP4 por streaming e validar manifesto/QA antes de qualquer upload.


## MCP remoto

Endpoint: `POST https://<dominio-publico>/mcp/youtube`

O servidor usa MCP Streamable HTTP stateless e responde em JSON. O conector Claude deve enviar o cabeçalho:

```http
Authorization: Bearer <YOUTUBE_MCP_API_KEY>
```

Configure a mesma chave em Request headers no conector personalizado do Claude. Gere uma chave aleatória exclusiva, com no mínimo 32 bytes, e armazene-a apenas no gerenciador de segredos do host e no cadastro protegido do conector. Nunca coloque a chave no Git, em prompts ou no chat.

Ferramentas disponíveis nesta etapa:

- `youtube_connection_status`: consulta se o canal do owner está conectado e retorna apenas metadados não secretos.
- `youtube_start_channel_connection`: gera uma URL OAuth Google de curta duração para o owner autorizar o canal correto.

O endpoint é stateless: não cria sessão MCP. Aceita requisições JSON-RPC por POST, retorna 202 para notificações e 405 para GET/DELETE. A resposta JSON exige que o cliente aceite `application/json`.

### Configuração do Claude

1. Publique a aplicação em um domínio HTTPS acessível pela internet.
2. Configure os segredos de produção no host, inclusive `YOUTUBE_MCP_API_KEY`.
3. No Claude, abra Personalizar → Conectores → Adicionar → Personalizado → Web.
4. Informe a URL `https://<dominio-publico>/mcp/youtube`.
5. Em Request headers, adicione `Authorization` com valor `Bearer <YOUTUBE_MCP_API_KEY>`.
6. Habilite o conector e teste primeiro `youtube_connection_status`.

O conector remoto é acessado pela infraestrutura da Anthropic, portanto localhost, endereço privado ou servidor sem HTTPS público não funcionam.
