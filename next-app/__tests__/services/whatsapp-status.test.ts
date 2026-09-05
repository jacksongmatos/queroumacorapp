// Status de entrega das mensagens que a loja MANDA.
//
// Contexto (2026-09-05): um template de abordagem foi enviado com sucesso —
// o portal registrou — e não apareceu no celular do cliente. Não havia como
// saber por quê: número sem WhatsApp, recusa de marketing e limite da Meta
// produzem exatamente o mesmo silêncio na tela.
//
// A Meta manda esses avisos no MESMO webhook das mensagens (field
// 'messages', com `statuses` no lugar de `messages`). Eles já passavam pela
// validação do envelope e eram DESCARTADOS, porque o parser de mensagens
// devolvia lista vazia e nada mais olhava o payload.

import { describe, it, expect } from 'vitest';
import {
  parseStatusUpdates,
  statusAvanca,
  classifyWebhookPayload,
} from '../../lib/api/_services/whatsapp';

const WABA = '1320667299892030';
const PHONE = '1220273824510260';

function envelopeDeStatus(statuses: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5511959765031', phone_number_id: PHONE },
              statuses,
            },
          },
        ],
      },
    ],
  };
}

describe('parseStatusUpdates', () => {
  it('lê sent/delivered/read', () => {
    const p = envelopeDeStatus([
      { id: 'wamid.a', status: 'sent', timestamp: '1757100000', recipient_id: '5511988887777' },
      { id: 'wamid.b', status: 'delivered', timestamp: '1757100001', recipient_id: '5511988887777' },
      { id: 'wamid.c', status: 'read', timestamp: '1757100002', recipient_id: '5511988887777' },
    ]);
    const out = parseStatusUpdates(p);
    expect(out.map((s) => s.status)).toEqual(['sent', 'delivered', 'read']);
    expect(out[0].messageId).toBe('wamid.a');
    expect(out[0].erro).toBeNull();
  });

  // O caso que motivou tudo: sem o motivo, a tela só diria "falhou".
  it('failed traz o motivo montado com código, título e detalhe', () => {
    const p = envelopeDeStatus([
      {
        id: 'wamid.x',
        status: 'failed',
        timestamp: '1757100000',
        recipient_id: '16502701234',
        errors: [
          {
            code: 131026,
            title: 'Message undeliverable',
            error_data: { details: 'Receiver is incapable of receiving this message' },
          },
        ],
      },
    ]);
    const [st] = parseStatusUpdates(p);
    expect(st.status).toBe('failed');
    expect(st.erro).toContain('131026');
    expect(st.erro).toContain('Message undeliverable');
    expect(st.erro).toContain('incapable');
  });

  it('failed sem detalhe ainda diz alguma coisa', () => {
    const p = envelopeDeStatus([
      { id: 'wamid.y', status: 'failed', timestamp: '1', recipient_id: '55', errors: [{}] },
    ]);
    expect(parseStatusUpdates(p)[0].erro).toBe('falha sem detalhe');
  });

  it('ignora status desconhecido e evento sem id', () => {
    const p = envelopeDeStatus([
      { id: 'wamid.z', status: 'deleted', timestamp: '1', recipient_id: '55' },
      { status: 'sent', timestamp: '1', recipient_id: '55' },
    ]);
    expect(parseStatusUpdates(p)).toEqual([]);
  });

  it('envelope de mensagem (sem statuses) não vira status', () => {
    const p = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WABA,
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: PHONE },
                messages: [{ from: '55', id: 'wamid.m', timestamp: '1', type: 'text', text: { body: 'oi' } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseStatusUpdates(p)).toEqual([]);
  });

  it('payload lixo não quebra', () => {
    expect(parseStatusUpdates(null)).toEqual([]);
    expect(parseStatusUpdates('x')).toEqual([]);
    expect(parseStatusUpdates({ entry: 'nao é array' })).toEqual([]);
  });

  // Se o envelope de status fosse rejeitado, a Meta reenviaria pra sempre.
  it('envelope de status passa pela validação do webhook', () => {
    const p = envelopeDeStatus([
      { id: 'wamid.a', status: 'sent', timestamp: '1', recipient_id: '55' },
    ]);
    expect(classifyWebhookPayload(p, { wabaId: WABA, phoneNumberId: PHONE })).toBe('processar');
  });
});

describe('statusAvanca', () => {
  // A Meta entrega fora de ordem e reenvia: um `sent` atrasado chegando
  // depois do `read` não pode fazer o ✓✓ virar ✓ de novo.
  it('só avança, nunca volta', () => {
    expect(statusAvanca(null, 'sent')).toBe(true);
    expect(statusAvanca('sent', 'delivered')).toBe(true);
    expect(statusAvanca('delivered', 'read')).toBe(true);

    expect(statusAvanca('read', 'delivered')).toBe(false);
    expect(statusAvanca('read', 'sent')).toBe(false);
    expect(statusAvanca('delivered', 'sent')).toBe(false);
  });

  it('o mesmo status não conta como avanço (evita PATCH à toa)', () => {
    expect(statusAvanca('delivered', 'delivered')).toBe(false);
  });

  // `failed` é desfecho: vence qualquer coisa, inclusive `read`. A Meta
  // pode reportar leitura e depois falha em cenários de reenvio, e o que
  // o operador precisa ver é a falha.
  it('failed vence tudo', () => {
    expect(statusAvanca('read', 'failed')).toBe(true);
    expect(statusAvanca('delivered', 'failed')).toBe(true);
    expect(statusAvanca('failed', 'read')).toBe(false);
  });

  it('status desconhecido no banco é tratado como "nenhum"', () => {
    expect(statusAvanca('coisa-estranha', 'sent')).toBe(true);
  });
});
