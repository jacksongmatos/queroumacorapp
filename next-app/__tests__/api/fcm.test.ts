// fcm.test.ts — trava as partes puras do sender FCM (o resto é rede).
//   - classifyFcmResult: decide remover token morto vs manter (o que evita
//     spammar o FCM com tokens desinstalados e limpa a tabela).
//   - base64UrlEncode: sem padding, url-safe (assinatura do JWT depende).
//   - pemToPkcs8: tolera `\n` literal (formato que as envs guardam).
//   - sendFcmToDeviceTokens: lista vazia = no-op sem tocar rede.

import { describe, expect, it } from 'vitest';
import {
  base64UrlEncode,
  classifyFcmResult,
  pemToPkcs8,
  sendFcmToDeviceTokens,
} from '../../lib/api/_services/fcm';

describe('classifyFcmResult', () => {
  it('2xx → sent', () => {
    expect(classifyFcmResult(200, '{}')).toBe('sent');
    expect(classifyFcmResult(204, '')).toBe('sent');
  });
  it('404/410 → expired (token morto, remover)', () => {
    expect(classifyFcmResult(404, 'NOT_FOUND')).toBe('expired');
    expect(classifyFcmResult(410, '')).toBe('expired');
  });
  it('400 com UNREGISTERED/INVALID_ARGUMENT → expired', () => {
    expect(classifyFcmResult(400, '{"error":{"status":"UNREGISTERED"}}')).toBe('expired');
    expect(classifyFcmResult(400, 'invalid registration-token')).toBe('expired');
  });
  it('400 genérico e 5xx → error (mantém token, não remove)', () => {
    expect(classifyFcmResult(400, 'quota exceeded')).toBe('error');
    expect(classifyFcmResult(500, 'internal')).toBe('error');
    expect(classifyFcmResult(401, 'auth')).toBe('error');
  });
});

describe('base64UrlEncode', () => {
  it('é url-safe e sem padding', () => {
    const out = base64UrlEncode(new Uint8Array([251, 255, 191])); // gera +/ e = no base64 normal
    expect(out).not.toMatch(/[+/=]/);
  });
  it('round-trip do conteúdo (via atob url→std)', () => {
    const bytes = new TextEncoder().encode('hello fcm');
    const enc = base64UrlEncode(bytes);
    const std = enc.replace(/-/g, '+').replace(/_/g, '/');
    expect(atob(std)).toBe('hello fcm');
  });
});

describe('pemToPkcs8', () => {
  it('aceita PEM com \\n literais e devolve os bytes do DER', () => {
    // DER curto arbitrário só pra exercitar o parse (não é chave real).
    const der = new Uint8Array([48, 3, 1, 2, 3]);
    let bin = '';
    for (const b of der) bin += String.fromCharCode(b);
    const b64 = btoa(bin);
    const pem = `-----BEGIN PRIVATE KEY-----\\n${b64}\\n-----END PRIVATE KEY-----\\n`;
    const buf = new Uint8Array(pemToPkcs8(pem));
    expect(Array.from(buf)).toEqual(Array.from(der));
  });
});

describe('sendFcmToDeviceTokens', () => {
  it('lista vazia → no-op, não chama rede', async () => {
    const sa = { projectId: 'p', clientEmail: 'x@y', privateKeyPem: 'k' };
    const out = await sendFcmToDeviceTokens(sa, [], {
      title: 't',
      body: 'b',
      url: '/feed',
    });
    expect(out).toEqual({ sent: 0, expiredIds: [], total: 0 });
  });
});

describe('verifyFcmCredentials', () => {
  it('service account com chave inválida → ok:false (não lança)', async () => {
    const { verifyFcmCredentials } = await import('../../lib/api/_services/fcm');
    const out = await verifyFcmCredentials({
      projectId: 'p',
      clientEmail: 'x@y.iam',
      privateKeyPem: 'nao-e-uma-chave',
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('token_exchange_failed');
  });
});
