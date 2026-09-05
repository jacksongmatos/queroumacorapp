// Tests do service lib/api/_services/whatsapp.ts.
//
// O ENVIO passou pro Dualhook em 2026-09-05 (api.dualhook.com), porque o
// número em Coexistence é gerenciado pelo app Meta DELES — o access token do
// nosso app não tem permissão nesse phone_number_id. O contrato é o mesmo da
// Cloud API (path, corpo, forma do erro): muda a base e o Bearer.
//
// Sem rede: `fetch` é stubado via vi.stubGlobal. Env entra por
// `process.env` (fallback do getRuntimeEnv fora do edge — ver
// lib/api/env.ts).
//
// Cobertura:
//   normalizeBrPhone: máscaras BR, com/sem DDI, inválidos
//   buildTextPayload / buildTemplatePayload: shape exato do Graph
//   getWhatsAppConfig: 503 sem token; default do phone number id; override
//   sendWhatsAppText: happy path (URL + Bearer + payload), telefone
//     inválido 400, erro 131047 → 422, erro 190 → 502, network → 502
//   verifyMetaSignature: assinatura válida, corpo adulterado, header ausente
//   parseInboundMessages: envelope real da Meta, envelope de status (vazio)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  buildTemplatePayload,
  buildTextPayload,
  DEFAULT_PHONE_NUMBER_ID,
  DEFAULT_WABA_ID,
  DUALHOOK_API_BASE,
  GRAPH_API_VERSION,
  checkWebhookUrlSecret,
  getWebhookAuthMode,
  getWhatsAppConfig,
  classifyWebhookPayload,
  isExpectedWebhookPayload,
  isForaDaJanela24h,
  isWhatsAppConfigured,
  normalizeBrPhone,
  parseInboundMessages,
  persistWhatsAppMessage,
  sendWhatsAppText,
  verifyMetaSignature,
} from '../../lib/api/_services/whatsapp';
import { ServiceError } from '../../lib/api/security';

const FAKE_TOKEN = 'EAAtest-token';

beforeEach(() => {
  process.env.DUALHOOK_API_KEY = FAKE_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

afterEach(() => {
  delete process.env.DUALHOOK_API_KEY;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_WEBHOOK_AUTH_MODE;
  vi.unstubAllGlobals();
});

// ─── normalizeBrPhone ───────────────────────────────────────────────────────

describe('normalizeBrPhone', () => {
  it('aceita celular com máscara e sem DDI', () => {
    expect(normalizeBrPhone('(11) 95976-5031')).toBe('5511959765031');
  });

  it('aceita celular já com DDI 55', () => {
    expect(normalizeBrPhone('5511959765031')).toBe('5511959765031');
  });

  it('aceita formato internacional com +', () => {
    expect(normalizeBrPhone('+55 11 95976-5031')).toBe('5511959765031');
  });

  it('aceita fixo (10 dígitos) prefixando 55', () => {
    expect(normalizeBrPhone('1133334444')).toBe('551133334444');
  });

  it('rejeita curto demais, vazio e não-numérico', () => {
    expect(normalizeBrPhone('959765031')).toBeNull();
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone('abc')).toBeNull();
  });

  it('rejeita comprimento inválido mesmo começando com 55', () => {
    expect(normalizeBrPhone('55119597650312345')).toBeNull();
  });
});

// ─── builders ───────────────────────────────────────────────────────────────

describe('payload builders', () => {
  it('buildTextPayload monta shape do Graph', () => {
    expect(buildTextPayload('5511959765031', 'olá')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511959765031',
      type: 'text',
      text: { preview_url: false, body: 'olá' },
    });
  });

  it('buildTemplatePayload monta template com language e components', () => {
    const components = [{ type: 'body', parameters: [{ type: 'text', text: 'Zé' }] }];
    const p = buildTemplatePayload('5511959765031', 'pedido_pronto', 'pt_BR', components);
    expect(p).toMatchObject({
      type: 'template',
      template: {
        name: 'pedido_pronto',
        language: { code: 'pt_BR' },
        components,
      },
    });
  });

  it('buildTemplatePayload omite components quando vazio', () => {
    const p = buildTemplatePayload('5511959765031', 'oi', 'pt_BR', []);
    expect((p.template as Record<string, unknown>).components).toBeUndefined();
  });
});

// ─── config ─────────────────────────────────────────────────────────────────

describe('getWhatsAppConfig', () => {
  it('throw ServiceError 503 sem DUALHOOK_API_KEY', () => {
    delete process.env.DUALHOOK_API_KEY;
    expect(isWhatsAppConfigured()).toBe(false);
    try {
      getWhatsAppConfig();
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).status).toBe(503);
    }
  });

  it('usa o phone number id default da Cali Colors', () => {
    expect(getWhatsAppConfig()).toEqual({
      token: FAKE_TOKEN,
      phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
    });
  });

  it('env WHATSAPP_PHONE_NUMBER_ID sobrescreve o default', () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
    expect(getWhatsAppConfig().phoneNumberId).toBe('999');
  });

  // Regressão 2026-09-05: os defaults apontavam pro registro ANTIGO do
  // número (cadastro direto da Cali Colors), e não pro emitido pela Meta
  // quando ele entrou em Coexistence via Dualhook. Sem as envs no painel, o
  // envio ia pra um phone_number_id que não é nosso e — pior — o webhook
  // recusava TODA entrega com 403, ou seja, silêncio total no portal.
  // Default errado não falha: ele mente. Por isso ficam travados aqui.
  it('os defaults são os IDs da conexão Dualhook, não os do registro antigo', () => {
    expect(DEFAULT_PHONE_NUMBER_ID).toBe('1220273824510260');
    expect(DEFAULT_WABA_ID).toBe('1320667299892030');
    expect(DEFAULT_PHONE_NUMBER_ID).not.toBe('109293361953640');
    expect(DEFAULT_WABA_ID).not.toBe('102067872689175');
  });
});

// ─── sendWhatsAppText ───────────────────────────────────────────────────────

function stubFetchOnce(status: number, json: unknown) {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('sendWhatsAppText', () => {
  it('happy path: POST na URL certa com Bearer e payload de texto', async () => {
    const spy = stubFetchOnce(200, {
      messages: [{ id: 'wamid.abc' }],
      contacts: [{ wa_id: '5511959765031' }],
    });

    const res = await sendWhatsAppText({ to: '(11) 95976-5031', body: 'oi!' });
    expect(res).toEqual({ messageId: 'wamid.abc', waId: '5511959765031' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DUALHOOK_API_BASE}/${GRAPH_API_VERSION}/${DEFAULT_PHONE_NUMBER_ID}/messages`
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_TOKEN}`
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: '5511959765031',
      type: 'text',
    });
  });

  it('número ESTRANGEIRO passa verbatim — não ganha 55 na frente', async () => {
    // Regressão de 2026-08-28: `normalizeBrPhone` colava '55' em qualquer
    // coisa com 10-11 dígitos, e o contato dos EUA 16503154274 virava
    // 5516503154274 — inexistente. O Baileys pendurava tentando resolver o
    // JID e o envio morria em 502. Com o Dualhook virando canal ÚNICO, o
    // mesmo erro voltaria por aqui se o normalizador fosse o BR.
    const spy = stubFetchOnce(200, {
      messages: [{ id: 'wamid.x' }],
      contacts: [{ wa_id: '16503154274' }],
    });
    await sendWhatsAppText({ to: '16503154274', body: 'hi' });
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).to).toBe('16503154274');
  });

  it('celular BR local ainda ganha o 55', async () => {
    const spy = stubFetchOnce(200, { messages: [{ id: 'w' }] });
    await sendWhatsAppText({ to: '(11) 95976-5031', body: 'oi' });
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).to).toBe('5511959765031');
  });

  it('telefone inválido → 400 sem tocar na rede', async () => {
    const spy = stubFetchOnce(200, {});
    await expect(sendWhatsAppText({ to: '123', body: 'oi' })).rejects.toMatchObject({
      status: 400,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('erro 131047 (fora da janela 24h) → 422 acionável', async () => {
    stubFetchOnce(400, { error: { message: 'Re-engagement message', code: 131047 } });
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('erro 190 (credencial expirada) → 400 com dica de regenerar', async () => {
    // 400 porque o Dualhook devolveu 401 (4xx): a culpa é da nossa
    // credencial. Antes era 502 — e o corpo sumia na página do Cloudflare.
    stubFetchOnce(401, { error: { message: 'Error validating access token', code: 190 } });
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({
      status: 400,
      extra: { upstreamStatus: 401 },
      message: expect.stringContaining('regenerar'),
    });
  });

  it('401/403 SEM code também vira erro de credencial', async () => {
    // O Dualhook recusa a Outbound API key com um 401 próprio, que não
    // carrega o `code: 190` da Meta. Sem esta ramificação a mensagem cairia
    // no genérico "recusou o envio: HTTP 401" e mandaria quem depura olhar o
    // painel da Meta — que não é mais onde a credencial vive.
    stubFetchOnce(401, { error: { message: 'Invalid API key' } });
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Dualhook'),
    });

    stubFetchOnce(403, {});
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({ status: 400, extra: { upstreamStatus: 403 } });
  });

  it('falha de rede → 500 (nunca 502)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({ status: 500, extra: { upstreamStatus: 0 } });
  });

  // ── por que NUNCA 502/504 ────────────────────────────────────────────────
  // O Cloudflare SUBSTITUI o corpo dessas duas pela página de erro dele. A
  // mensagem que explica a falha — credencial, janela de 24h, número errado —
  // nunca chegaria na tela: o operador via só "502 Bad gateway". Erro 4xx do
  // Dualhook vira 400; o resto, 500. Os dois passam com o corpo intacto.

  it('4xx do Dualhook → 400, com o upstreamStatus no corpo', async () => {
    stubFetchOnce(422, { error: { message: 'Invalid recipient' } });
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({
      status: 400,
      extra: { upstreamStatus: 422 },
      message: expect.stringContaining('Invalid recipient'),
    });
  });

  it('5xx do Dualhook → 500, também com o status real no corpo', async () => {
    stubFetchOnce(503, { error: { message: 'upstream indisponível' } });
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({ status: 500, extra: { upstreamStatus: 503 } });
  });

  it('nenhuma falha responde 502 ou 504', async () => {
    // Trava a regra inteira de uma vez: qualquer status de falha que o
    // Dualhook devolva, o nosso nunca pode ser um dos dois que o Cloudflare
    // sequestra.
    for (const status of [400, 401, 403, 404, 422, 429, 500, 502, 503, 504]) {
      stubFetchOnce(status, { error: { message: 'x' } });
      const err = await sendWhatsAppText({ to: '11959765031', body: 'oi' }).catch(
        (e: ServiceError) => e,
      );
      expect([502, 504], `status ${status}`).not.toContain(
        (err as ServiceError).status,
      );
    }
  });

  it('corpo NÃO-JSON (HTML de proxy) ainda vira erro legível', async () => {
    // `res.json()` engoliria justamente o caso que mais precisa ser visto.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
    );
    await expect(
      sendWhatsAppText({ to: '11959765031', body: 'oi' })
    ).rejects.toMatchObject({ status: 500, extra: { upstreamStatus: 502 } });
  });
});

// ─── verifyMetaSignature ────────────────────────────────────────────────────

describe('verifyMetaSignature', () => {
  const secret = 'app-secret-de-teste';
  const body = '{"object":"whatsapp_business_account","entry":[]}';
  const sign = (b: string, s: string) =>
    'sha256=' + createHmac('sha256', s).update(b).digest('hex');

  it('aceita assinatura válida', async () => {
    expect(await verifyMetaSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejeita corpo adulterado e secret errado', async () => {
    expect(await verifyMetaSignature(body + 'x', sign(body, secret), secret)).toBe(false);
    expect(await verifyMetaSignature(body, sign(body, 'outro'), secret)).toBe(false);
  });

  it('rejeita header ausente ou sem prefixo sha256=', async () => {
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
    expect(await verifyMetaSignature(body, 'md5=abc', secret)).toBe(false);
  });
});

// ─── persistWhatsAppMessage (SQL Wave 38) ───────────────────────────────────

describe('persistWhatsAppMessage', () => {
  const SUPA_URL = 'https://fake.supabase.co';
  const SERVICE_KEY = 'service-key-teste';

  beforeEach(() => {
    process.env.SUPABASE_URL = SUPA_URL;
    process.env.SUPABASE_SERVICE_ROLE = SERVICE_KEY;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE;
  });

  it('POST no REST com service key, on_conflict e ignore-duplicates', async () => {
    const spy = stubFetchOnce(201, {});
    const ok = await persistWhatsAppMessage({
      direction: 'in',
      waId: '16503154274',
      profileName: 'Jackson',
      messageId: 'wamid.abc',
      type: 'text',
      body: 'oi',
      waTimestamp: '1756100000',
    });
    expect(ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SUPA_URL}/rest/v1/whatsapp_messages?on_conflict=message_id`);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(headers.Prefer).toContain('ignore-duplicates');
    const row = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(row).toMatchObject({
      direction: 'in',
      wa_id: '16503154274',
      message_id: 'wamid.abc',
      body: 'oi',
    });
    // Epoch em segundos vira ISO.
    expect(row.wa_timestamp).toBe(new Date(1756100000 * 1000).toISOString());
  });

  it('messageId vazio vira NULL (não colide no UNIQUE)', async () => {
    const spy = stubFetchOnce(201, {});
    await persistWhatsAppMessage({ direction: 'out', waId: '5511988887777', messageId: '' });
    const row = JSON.parse((spy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(row.message_id).toBeNull();
  });

  it('best-effort: sem service key → false sem lançar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE;
    const spy = stubFetchOnce(201, {});
    expect(await persistWhatsAppMessage({ direction: 'in', waId: 'x' })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('best-effort: REST 500 → false; network throw → false', async () => {
    stubFetchOnce(500, { message: 'boom' });
    expect(await persistWhatsAppMessage({ direction: 'in', waId: 'x' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await persistWhatsAppMessage({ direction: 'in', waId: 'x' })).toBe(false);
  });
});

// ─── isExpectedWebhookPayload (modo Dualhook) ───────────────────────────────

describe('isExpectedWebhookPayload', () => {
  const expected = { wabaId: '865837919828100', phoneNumberId: '1284183724779574' };
  const envelope = (overrides: Record<string, unknown> = {}) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '865837919828100',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5511999990000', phone_number_id: '1284183724779574' },
              messages: [],
            },
          },
        ],
      },
    ],
    ...overrides,
  });

  it('aceita envelope do nosso WABA + número (inclusive só com statuses)', () => {
    expect(isExpectedWebhookPayload(envelope(), expected)).toBe(true);
  });

  it('rejeita WABA de outro cliente', () => {
    const p = envelope();
    p.entry[0].id = '102067872689175';
    expect(isExpectedWebhookPayload(p, expected)).toBe(false);
  });

  it('rejeita phone_number_id diferente', () => {
    const p = envelope();
    p.entry[0].changes[0].value.metadata.phone_number_id = '109293361953640';
    expect(isExpectedWebhookPayload(p, expected)).toBe(false);
  });

  // 2026-09-05: evento que não é de mensagem deixou de ser 403. A Meta manda
  // status de template e mudança de conta no MESMO webhook; 403 pra ela
  // significa "não entreguei", então ela reenviava pra sempre um evento que
  // nunca íamos processar.
  it('evento que não é de mensagem → ignorar (não rejeitar)', () => {
    const p = envelope();
    (p.entry[0].changes[0] as { field: string }).field = 'message_template_status_update';
    expect(classifyWebhookPayload(p, expected)).toBe('ignorar');
  });

  it('mensagem do nosso número → processar', () => {
    expect(classifyWebhookPayload(envelope(), expected)).toBe('processar');
  });

  it('envelope de outra conta → rejeitar, mesmo sem ser de mensagem', () => {
    const p = envelope();
    p.entry[0].id = '999999999';
    (p.entry[0].changes[0] as { field: string }).field = 'account_update';
    expect(classifyWebhookPayload(p, expected)).toBe('rejeitar');
  });

  it('mensagem endereçada a OUTRO número segue rejeitada', () => {
    // Aqui não é "evento que não me interessa" — é entrega no endereço
    // errado. Engolir com 200 esconderia erro de configuração.
    const p = envelope();
    p.entry[0].changes[0].value.metadata.phone_number_id = '109293361953640';
    expect(classifyWebhookPayload(p, expected)).toBe('rejeitar');
  });

  it('não processa field ≠ messages, entry vazio, object errado e não-objeto', () => {
    const p = envelope();
    (p.entry[0].changes[0] as { field: string }).field = 'account_update';
    // false aqui = "não é mensagem pra processar"; o 403 quem decide é o
    // veredito da rota, e pra este caso ele é 'ignorar'.
    expect(isExpectedWebhookPayload(p, expected)).toBe(false);
    expect(isExpectedWebhookPayload(envelope({ entry: [] }), expected)).toBe(false);
    expect(isExpectedWebhookPayload(envelope({ object: 'page' }), expected)).toBe(false);
    expect(isExpectedWebhookPayload(null, expected)).toBe(false);
    expect(isExpectedWebhookPayload('x', expected)).toBe(false);
  });
});

describe('checkWebhookUrlSecret', () => {
  const base = 'https://www.queroumacor.com.br/api/whatsapp/webhook';
  it('ok quando ?token= bate com a env', () => {
    expect(checkWebhookUrlSecret(new URL(`${base}?token=abc123`), 'abc123')).toBe('ok');
  });
  it('invalid com token errado, ausente ou de tamanho diferente', () => {
    expect(checkWebhookUrlSecret(new URL(`${base}?token=abc124`), 'abc123')).toBe('invalid');
    expect(checkWebhookUrlSecret(new URL(base), 'abc123')).toBe('invalid');
    expect(checkWebhookUrlSecret(new URL(`${base}?token=abc`), 'abc123')).toBe('invalid');
  });
  it('missing-config sem env (fail-closed)', () => {
    expect(checkWebhookUrlSecret(new URL(`${base}?token=abc123`), undefined)).toBe('missing-config');
    expect(checkWebhookUrlSecret(new URL(`${base}?token=abc123`), '')).toBe('missing-config');
  });
  it('convive com os params hub.* do GET de verificação', () => {
    const u = new URL(`${base}?token=abc123&hub.mode=subscribe&hub.challenge=1&hub.verify_token=v`);
    expect(checkWebhookUrlSecret(u, 'abc123')).toBe('ok');
  });
});

describe('getWebhookAuthMode', () => {
  it('default é payload; só "hmac" exato liga o HMAC', () => {
    expect(getWebhookAuthMode()).toBe('payload');
    process.env.WHATSAPP_WEBHOOK_AUTH_MODE = 'HMAC';
    expect(getWebhookAuthMode()).toBe('payload');
    process.env.WHATSAPP_WEBHOOK_AUTH_MODE = 'hmac';
    expect(getWebhookAuthMode()).toBe('hmac');
  });
});

// ─── parseInboundMessages ───────────────────────────────────────────────────

describe('parseInboundMessages', () => {
  it('extrai mensagem de texto do envelope real da Meta', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '102067872689175',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ profile: { name: 'Zé Pintor' }, wa_id: '5511988887777' }],
                messages: [
                  {
                    from: '5511988887777',
                    id: 'wamid.xyz',
                    timestamp: '1756100000',
                    type: 'text',
                    text: { body: 'Quero um orçamento' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundMessages(payload)).toEqual([
      {
        from: '5511988887777',
        messageId: 'wamid.xyz',
        timestamp: '1756100000',
        type: 'text',
        text: 'Quero um orçamento',
        profileName: 'Zé Pintor',
      },
    ]);
  });

  it('envelope só de status (sem messages) → lista vazia', () => {
    const payload = {
      entry: [
        {
          changes: [
            { field: 'messages', value: { statuses: [{ id: 'wamid.a', status: 'delivered' }] } },
          ],
        },
      ],
    };
    expect(parseInboundMessages(payload)).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages({})).toEqual([]);
  });
});

// ─── isForaDaJanela24h ──────────────────────────────────────────────────────

describe('isForaDaJanela24h', () => {
  // Quem envia em LOTE (o follow-up) precisa separar "não dá pra enviar
  // nunca, só com template" de "deu erro, tenta de novo". Sem isso a
  // varredura martela o mesmo contato de hora em hora, pra sempre.
  it('reconhece o 422 da janela de 24h', () => {
    expect(isForaDaJanela24h(new ServiceError('fora da janela', 422))).toBe(true);
  });

  it('não confunde com outros erros', () => {
    expect(isForaDaJanela24h(new ServiceError('credencial', 400))).toBe(false);
    expect(isForaDaJanela24h(new ServiceError('upstream', 500))).toBe(false);
    expect(isForaDaJanela24h(new Error('qualquer'))).toBe(false);
    expect(isForaDaJanela24h(null)).toBe(false);
  });
});
