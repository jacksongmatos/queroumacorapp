// whatsapp-evo — Evolution API (Baileys/Render). Cobre as funções puras:
// config, jid→telefone, corpo do sendText e o parse do webhook
// MESSAGES_UPSERT (objeto e array, grupo ignorado, fromMe vira 'out').
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEvoTextBody,
  sendEvolutionText,
  getEvolutionConfig,
  isEvolutionConfigured,
  jidToPhone,
  normalizeWhatsAppTarget,
  parseEvolutionWebhook,
} from '../../lib/api/_services/whatsapp-evo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Erro que o `AbortSignal.timeout` levanta — o discriminador é o `name`. */
function timeoutError() {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  return e;
}

describe('getEvolutionConfig', () => {
  it('throw 503 sem envs', () => {
    expect(() => getEvolutionConfig()).toThrowError(/não configurada/);
    expect(isEvolutionConfigured()).toBe(false);
  });

  it('lê envs e normaliza barra final da URL', () => {
    vi.stubEnv('EVOLUTION_API_URL', 'https://evolution-api-8arv.onrender.com/');
    vi.stubEnv('EVOLUTION_API_KEY', 'k123');
    const cfg = getEvolutionConfig();
    expect(cfg.baseUrl).toBe('https://evolution-api-8arv.onrender.com');
    expect(cfg.apiKey).toBe('k123');
    expect(cfg.instance).toBe('meu-whatsapp'); // default
    expect(isEvolutionConfigured()).toBe(true);
  });

  it('EVOLUTION_INSTANCE sobrescreve o default', () => {
    vi.stubEnv('EVOLUTION_API_URL', 'https://x.onrender.com');
    vi.stubEnv('EVOLUTION_API_KEY', 'k');
    vi.stubEnv('EVOLUTION_INSTANCE', 'outra');
    expect(getEvolutionConfig().instance).toBe('outra');
  });
});

describe('jidToPhone', () => {
  it('extrai dígitos do jid individual', () => {
    expect(jidToPhone('5511920725935@s.whatsapp.net')).toBe('5511920725935');
  });
  it('lida com device suffix (:12)', () => {
    expect(jidToPhone('5511920725935:12@s.whatsapp.net')).toBe('5511920725935');
  });
  it('grupo e broadcast viram vazio', () => {
    expect(jidToPhone('123456789-987654@g.us')).toBe('');
    expect(jidToPhone('status@broadcast')).toBe('');
  });
  it('jid curto/inválido vira vazio', () => {
    expect(jidToPhone('')).toBe('');
    expect(jidToPhone('abc@s.whatsapp.net')).toBe('');
  });
});

describe('normalizeWhatsAppTarget', () => {
  it('BR local vira +55 (celular com 9 e fixo)', () => {
    expect(normalizeWhatsAppTarget('11 92072-5935')).toBe('5511920725935'); // celular
    expect(normalizeWhatsAppTarget('(11) 3255-1000')).toBe('551132551000'); // fixo
  });

  it('BR já com DDI passa direto', () => {
    expect(normalizeWhatsAppTarget('5511920725935')).toBe('5511920725935');
    expect(normalizeWhatsAppTarget('+55 (11) 95976-5031')).toBe('5511959765031');
    expect(normalizeWhatsAppTarget('551132551000')).toBe('551132551000');
  });

  it('EUA passa VERBATIM — não ganha 55 na frente (o bug do 502)', () => {
    // +1 650 315-4274: 11 dígitos, mas 3º dígito não é 9 → não é celular BR.
    expect(normalizeWhatsAppTarget('16503154274')).toBe('16503154274');
    expect(normalizeWhatsAppTarget('+1 (650) 315-4274')).toBe('16503154274');
  });

  it('outros países passam verbatim', () => {
    expect(normalizeWhatsAppTarget('351912345678')).toBe('351912345678'); // Portugal
    expect(normalizeWhatsAppTarget('+34 612 345 678')).toBe('34612345678'); // Espanha
    expect(normalizeWhatsAppTarget('818012345678')).toBe('818012345678'); // Japão
  });

  it('lixo e comprimentos impossíveis viram null', () => {
    expect(normalizeWhatsAppTarget('')).toBeNull();
    expect(normalizeWhatsAppTarget('abc')).toBeNull();
    expect(normalizeWhatsAppTarget('12345')).toBeNull(); // curto demais
    expect(normalizeWhatsAppTarget('1234567890123456')).toBeNull(); // 16 dígitos
  });

  it('caso-limite: 11 dígitos começando com 55 NÃO é tratado como BR com DDI', () => {
    // 55 9xxxx-xxxx local (DDD 55 = RS) — 11 dígitos com 9 no 3º → ganha DDI.
    expect(normalizeWhatsAppTarget('55991234567')).toBe('5555991234567');
  });
});

describe('buildEvoTextBody', () => {
  it('shape { number, text }', () => {
    expect(buildEvoTextBody('5511920725935', 'olá')).toEqual({
      number: '5511920725935',
      text: 'olá',
    });
  });
});

describe('parseEvolutionWebhook', () => {
  const inbound = {
    event: 'messages.upsert',
    instance: 'meu-whatsapp',
    data: {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'MSG1' },
      pushName: 'Cliente Teste',
      message: { conversation: 'Oi, quero um orçamento' },
      messageTimestamp: 1724900000,
    },
  };

  it('mensagem recebida (data como objeto)', () => {
    const out = parseEvolutionWebhook(inbound);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      direction: 'in',
      waId: '5511999998888',
      messageId: 'MSG1',
      type: 'text',
      text: 'Oi, quero um orçamento',
      profileName: 'Cliente Teste',
      timestamp: '1724900000',
    });
    // O item cru e a chave viajam junto: sao eles que permitem baixar a
    // midia depois (Wave 49). Sem isso o portal so mostra "[audio]".
    expect(out[0].raw).toBeTruthy();
    expect(out[0].key?.id).toBe('MSG1');
  });

  it('MESSAGES_UPSERT maiúsculo com underscore também casa', () => {
    const out = parseEvolutionWebhook({ ...inbound, event: 'MESSAGES_UPSERT' });
    expect(out).toHaveLength(1);
  });

  it('fromMe=true vira direction out', () => {
    const out = parseEvolutionWebhook({
      ...inbound,
      data: { ...inbound.data, key: { ...inbound.data.key, fromMe: true } },
    });
    expect(out[0].direction).toBe('out');
  });

  it('data como ARRAY processa todas', () => {
    const out = parseEvolutionWebhook({
      event: 'messages.upsert',
      data: [inbound.data, { ...inbound.data, key: { ...inbound.data.key, id: 'MSG2' } }],
    });
    expect(out.map((m) => m.messageId)).toEqual(['MSG1', 'MSG2']);
  });

  it('grupo é ignorado', () => {
    const out = parseEvolutionWebhook({
      event: 'messages.upsert',
      data: { ...inbound.data, key: { ...inbound.data.key, remoteJid: '123-456@g.us' } },
    });
    expect(out).toHaveLength(0);
  });

  it('evento que não é upsert é ignorado', () => {
    expect(parseEvolutionWebhook({ event: 'connection.update', data: inbound.data })).toEqual([]);
    expect(parseEvolutionWebhook(null)).toEqual([]);
    expect(parseEvolutionWebhook({})).toEqual([]);
  });

  it('extendedTextMessage e mídia com caption', () => {
    const mk = (message: Record<string, unknown>) =>
      parseEvolutionWebhook({
        event: 'messages.upsert',
        data: { ...inbound.data, message },
      })[0];
    expect(mk({ extendedTextMessage: { text: 'resposta' } })).toMatchObject({
      type: 'text',
      text: 'resposta',
    });
    expect(mk({ imageMessage: { caption: 'foto da parede' } })).toMatchObject({
      type: 'image',
      text: 'foto da parede',
    });
    expect(mk({ audioMessage: { seconds: 3 } })).toMatchObject({ type: 'audio', text: '[áudio]' });
  });
});

// Envio que estoura o tempo: a mensagem de erro tem que dizer a CAUSA, não
// repetir "o Render dorme" (falso desde 2026-08-29, o plano é pago). Sessão
// caída e servidor lento davam o mesmo texto e pedem ações opostas.
describe('sendEvolutionText — estouro de tempo explica a causa', () => {
  function stubEnvs() {
    vi.stubEnv('EVOLUTION_API_URL', 'https://x.onrender.com');
    vi.stubEnv('EVOLUTION_API_KEY', 'k');
  }

  /** 1º fetch = envio (estoura); 2º = sonda de connectionState. */
  function stubFetch(state: string | null) {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({
        ok: state !== null,
        json: async () => ({ instance: { state } }),
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("instância 'close' manda reconectar o QR, não esperar", async () => {
    stubEnvs();
    stubFetch('close');
    await expect(sendEvolutionText({ to: '5511962680094', body: 'oi' })).rejects.toThrowError(
      /DESCONECTADA[\s\S]*QR/
    );
  });

  it("instância 'open' diz que é lentidão e que a mensagem NÃO saiu", async () => {
    stubEnvs();
    stubFetch('open');
    await expect(sendEvolutionText({ to: '5511962680094', body: 'oi' })).rejects.toThrowError(
      /NÃO saiu/
    );
  });

  it('sonda sem resposta cai num texto genérico, mas ainda acionável', async () => {
    stubEnvs();
    stubFetch(null);
    await expect(sendEvolutionText({ to: '5511962680094', body: 'oi' })).rejects.toThrowError(
      /nem informou o estado/
    );
  });

  it('falha que não é timeout não gasta a sonda', async () => {
    stubEnvs();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendEvolutionText({ to: '5511962680094', body: 'oi' })).rejects.toThrowError(
      /falha de rede/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
