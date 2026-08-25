# WhatsApp Cloud API — integração backend

Integração do número oficial da Cali Colors (**+55 11 95976-5031**) com o
WhatsApp Cloud API da Meta, pra enviar mensagens programaticamente e receber
mensagens/status via webhook.

## IDs da conta (não são secrets)

| Item | Valor |
| --- | --- |
| WABA ID (WhatsApp Business Account) | `102067872689175` |
| Phone Number ID | `109293361953640` |
| Número | +55 11 95976-5031 (CaliColors Tintas) |
| App Meta | CaliColors Integracao API (App ID `1752105782712789`) |
| Versão do Graph | `v21.0` |

Esses IDs estão como default em `next-app/lib/api/_services/whatsapp.ts` —
aparecem na URL da API e no painel da Meta, então não há problema em
versioná-los. **O token de acesso NUNCA entra no repo.**

## Variáveis de ambiente (Cloudflare Pages → Production)

| Env | Obrigatória | O que é |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Sim (pra enviar) | Token permanente do system user da Meta. **Secret.** |
| `META_APP_SECRET` | Sim (pro webhook) | App Secret do app "CaliColors Integracao API" (Meta → Configurações do app → Básico). Valida a assinatura `X-Hub-Signature-256`. **Secret.** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Sim (pro webhook) | String qualquer escolhida por nós (ex.: gerar com `openssl rand -hex 24`). A mesma string é colada no painel da Meta ao cadastrar o webhook. |
| `WHATSAPP_PHONE_NUMBER_ID` | Não | Só se o número mudar — default no código já é o da Cali Colors. |

Depois de setar as envs, **refazer o deploy** (envs só valem em build novo).

## Endpoints

### `POST /api/whatsapp/send` — envio (só admin)

Auth igual ao `/api/admin/users`: token Supabase de um email em
`ADMIN_EMAILS` (header `Authorization: Bearer …` ou `accessToken` no body).
Rate limit 30/min. Grava trilha em `audit_log` (`action='whatsapp.send'`,
só preview do corpo — LGPD data minimization).

```jsonc
// texto livre (só funciona dentro da janela de 24h)
{ "to": "(11) 98888-7777", "body": "Seu pedido está pronto!" }

// template aprovado (funciona sempre)
{
  "to": "5511988887777",
  "type": "template",
  "template": "pedido_pronto",
  "languageCode": "pt_BR",
  "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "Zé" }] }]
}
```

Resposta: `{ ok: true, messageId: "wamid.…", waId: "5511988887777" }`.

O telefone aceita máscara BR com ou sem DDI (`normalizeBrPhone`).

**Janela de 24h da Meta**: mensagem de TEXTO livre só chega pra quem mandou
mensagem pro número nas últimas 24h. Fora da janela o Graph devolve o erro
131047 e a rota responde **422** com "use um template aprovado". Templates
são criados/aprovados no painel da Meta (WhatsApp Manager → Message
Templates).

### `GET/POST /api/whatsapp/webhook` — recebimento

- **GET** = verificação do painel da Meta (confere
  `hub.verify_token` contra `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, devolve
  `hub.challenge`).
- **POST** = eventos. Assinatura `X-Hub-Signature-256` (HMAC-SHA256 do
  `META_APP_SECRET` sobre o raw body) validada ANTES do parse; inválida →
  401, secret ausente → 503. Depois da assinatura ok, **sempre 200**
  (anti-retry-storm, mesma filosofia do mp-webhook).
- Por enquanto o POST só loga as mensagens recebidas (preview de 60 chars →
  Cloudflare logs). Persistir em tabela / auto-responder é etapa futura —
  **não** misturar com a tabela `messages` do chat interno (user↔user, FK
  em profiles).

### Cadastro do webhook no painel da Meta

1. developers.facebook.com → app "CaliColors Integracao API" → WhatsApp →
   Configuration → Webhook.
2. Callback URL: `https://www.queroumacor.com.br/api/whatsapp/webhook`
3. Verify token: o mesmo valor da env `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe no campo **messages**.

## Segurança

- Token só em env do CF Pages (lido via `getRuntimeEnv()` — no edge os
  secrets NÃO chegam em `process.env`; ver `lib/api/env.ts`).
- Se o token vazar (colado em lugar público, commitado por engano):
  regenerar na hora em Meta Business Settings → System Users → token do
  app. O código não muda — só trocar a env e redeploy.
- Envio é admin-only + rate limit + audit log. Sem endpoint público de
  envio: usuário comum continua usando links `wa.me` (client-side, sem
  token).

## Testes

`next-app/__tests__/services/whatsapp.test.ts` (22): normalização de
telefone BR, shape dos payloads do Graph, config/503, envio com fetch
stubado (happy path, 131047→422, 190→502, rede→502), assinatura HMAC do
webhook e parse do envelope de mensagens da Meta.
