// Escolha do template da abordagem: com nome × sem nome.
//
// A regra existe pra impedir um erro específico e visível pro cliente:
// mandar `calicolors_nome` com `{{1}}` vazio faz a Meta entregar "Oi ,"
// (ou recusar o envio). Como a mesma decisão é tomada em três lugares — o
// botão de abordagem, a tela de WhatsApp e o follow-up —, ela vive numa
// função só; se cada um decidisse por conta, um deles acabaria mandando o
// nome vazio.

import { describe, it, expect, afterEach } from 'vitest';
import {
  escolherTemplate,
  getTemplateAbordagem,
  primeiroNome,
  TEMPLATE_COM_NOME,
  TEMPLATE_SEM_NOME,
} from '../../lib/api/_services/whatsapp';

afterEach(() => {
  delete process.env.WHATSAPP_TEMPLATE_ABORDAGEM;
});

describe('primeiroNome', () => {
  it('pega só o primeiro nome', () => {
    expect(primeiroNome('Maria Aparecida Souza')).toBe('Maria');
    expect(primeiroNome('  João   da Silva ')).toBe('João');
  });

  it('nome vazio ou só espaço não serve', () => {
    expect(primeiroNome('')).toBeNull();
    expect(primeiroNome('   ')).toBeNull();
    expect(primeiroNome(null)).toBeNull();
    expect(primeiroNome(undefined)).toBeNull();
  });

  // A base importada tem lead cujo `name` é o próprio telefone. "Oi
  // 11987654321" é pior do que não usar nome nenhum.
  it('telefone no lugar do nome não serve', () => {
    expect(primeiroNome('11987654321')).toBeNull();
    expect(primeiroNome('(11) 98765-4321')).toBeNull();
    expect(primeiroNome('+1 650 315 4274')).toBeNull();
  });

  it('inicial solta não serve como tratamento', () => {
    expect(primeiroNome('J Silva')).toBeNull();
  });

  it('nome com acento e hífen passa inteiro', () => {
    expect(primeiroNome('Ângela Maria')).toBe('Ângela');
    expect(primeiroNome('Ana-Clara Souza')).toBe('Ana-Clara');
  });
});

describe('escolherTemplate', () => {
  it('com nome → template de variável, com o nome no {{1}}', () => {
    const e = escolherTemplate('Beatris Porsebon');
    expect(e.template).toBe(TEMPLATE_COM_NOME);
    expect(e.nome).toBe('Beatris');
    expect(e.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Beatris' }] },
    ]);
  });

  // O caso que a regra existe pra evitar.
  it('sem nome → template FIXO, e nenhum component', () => {
    for (const bruto of ['', '   ', null, undefined, '11987654321']) {
      const e = escolherTemplate(bruto);
      expect(e.template).toBe(TEMPLATE_SEM_NOME);
      expect(e.components).toBeUndefined();
      expect(e.nome).toBeNull();
    }
  });

  it('nunca monta parameters com texto vazio', () => {
    const e = escolherTemplate('   ');
    const params = e.components?.[0]?.parameters ?? [];
    for (const p of params) {
      expect(String((p as { text?: string }).text ?? '')).not.toBe('');
    }
  });

  it('env WHATSAPP_TEMPLATE_ABORDAGEM troca o de variável', () => {
    process.env.WHATSAPP_TEMPLATE_ABORDAGEM = 'outro_template';
    expect(getTemplateAbordagem()).toBe('outro_template');
    expect(escolherTemplate('Maria').template).toBe('outro_template');
  });

  // Sem nome, a env não vale: aquele template espera {{1}} e não temos
  // o que pôr nele.
  it('sem nome, cai no fixo mesmo com a env apontando pro de variável', () => {
    process.env.WHATSAPP_TEMPLATE_ABORDAGEM = 'outro_template';
    expect(escolherTemplate(null).template).toBe(TEMPLATE_SEM_NOME);
  });

  it('default é o template com nome', () => {
    expect(getTemplateAbordagem()).toBe(TEMPLATE_COM_NOME);
  });
});
