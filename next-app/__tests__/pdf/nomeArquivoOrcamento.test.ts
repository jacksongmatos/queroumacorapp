// O nome do arquivo é o que o pintor vê na pasta Downloads e o que o
// cliente recebe. Precisa (a) carregar o mesmo número que o PDF imprime
// no cabeçalho e (b) nunca virar um nome inválido por causa de acento,
// barra ou emoji no nome do cliente.
import { describe, expect, it } from 'vitest';
import { nomeArquivoOrcamento } from '../../lib/pdf/quotePdf';
import type { Quote } from '../../lib/types';

const base = (over: Partial<Quote> = {}): Quote =>
  ({ id: '1a2b3c4d-5e6f-7788-99aa-bbccddeeff00', painter_id: 'p', ...over }) as Quote;

describe('nomeArquivoOrcamento', () => {
  it('usa os MESMOS 8 caracteres que o cabeçalho do PDF imprime', () => {
    // O PDF escreve `#${quote.id.slice(0, 8)}` — papel e arquivo têm que
    // bater, senão não dá pra casar um com o outro.
    expect(nomeArquivoOrcamento(base())).toContain('1a2b3c4d');
  });

  it('põe o nome do cliente, sem acento e sem espaço', () => {
    expect(nomeArquivoOrcamento(base({ client_name: 'Maria Conceição' })))
      .toBe('orcamento-1a2b3c4d-maria-conceicao.pdf');
  });

  it('cai no nome vindo do join quando client_name está vazio', () => {
    expect(nomeArquivoOrcamento(base({ client: { name: 'João Silva' } })))
      .toBe('orcamento-1a2b3c4d-joao-silva.pdf');
  });

  it('sem cliente, fica só o número — nunca um traço solto no fim', () => {
    expect(nomeArquivoOrcamento(base())).toBe('orcamento-1a2b3c4d.pdf');
  });

  it('barra, emoji e pontuação não viram nome de arquivo', () => {
    const n = nomeArquivoOrcamento(base({ client_name: 'A/B\\C: "casa" 🏠' }));
    expect(n).toBe('orcamento-1a2b3c4d-a-b-c-casa.pdf');
    expect(n).not.toMatch(/[/\\:"]/);
  });

  it('nome quilométrico é cortado, e não sobra traço no corte', () => {
    const n = nomeArquivoOrcamento(base({ client_name: 'a'.repeat(30) + ' ' + 'b'.repeat(30) }));
    expect(n.length).toBeLessThanOrEqual('orcamento-1a2b3c4d-'.length + 40 + 4);
    expect(n).not.toContain('-.pdf');
  });

  it('orçamento ainda sem id não quebra', () => {
    expect(nomeArquivoOrcamento(base({ id: '' }))).toBe('orcamento-novo.pdf');
  });
});

// Os dois filtros de texto novos (2026-08-30): emoji não pode chegar nem
// na fonte do jsPDF (vira "Ø=ÜÌ") nem na URL do wa.me (o wrapper entrega
// "�" no WhatsApp). Acento do pt-BR passa ileso nos dois.
import { semEmoji, textoPdfSeguro } from '../../lib/pdf/quotePdf';

describe('textoPdfSeguro', () => {
  it('remove emoji e preserva acento', () => {
    expect(textoPdfSeguro('📌 Tipo: Pintura três cômodos, 80 m²'))
      .toBe('Tipo: Pintura três cômodos, 80 m²');
  });
  it('linhas do escopo ficam limpas, uma por linha', () => {
    expect(textoPdfSeguro('📌 Tipo: X\n🧱 Superfície: Chão'))
      .toBe('Tipo: X\nSuperfície: Chão');
  });
  it('vazio e null não quebram', () => {
    expect(textoPdfSeguro(null)).toBe('');
    expect(textoPdfSeguro('')).toBe('');
  });
});

describe('semEmoji', () => {
  it('tira o emoji do texto do WhatsApp mas mantém o resto', () => {
    expect(semEmoji('📌 Tipo: Pintura externa / fachada'))
      .toBe('Tipo: Pintura externa / fachada');
  });
  it('acento e pontuação sobrevivem', () => {
    expect(semEmoji('Área: 80 m² — orçamento válido'))
      .toBe('Área: 80 m² — orçamento válido');
  });
});
