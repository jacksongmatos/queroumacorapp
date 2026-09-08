// quotePdf.ts — gera Blob de PDF do orçamento usando jsPDF puro (sem html2canvas
// que adicionaria ~200kb). Layout de referência (LP Decor, 2026-09-08):
//   - Cabeçalho: logo + nome do pintor + "Pintor" + CNPJ/CPF/endereço/contato,
//     caixa "Orçamento nº"
//   - Cliente (nome, telefone, endereço, CEP) + "Visita técnica em:"
//   - Serviços em cards: item + descrição | valor unitário | quantidade | subtotal
//   - Faixas "Valor total dos Serviços" / Subtotal / Descontos / "Valor total"
//   - Laudo técnico, informações adicionais, pagamento (formas + chave PIX),
//     "parte interna/externa", botões Recusar/Aprovar (links wa.me)
//   - Página "Área do profissional" (logo + bio) e rodapé "Documento gerado em"
// O conteúdo vem TODO de `lib/orcamentoDocumento.ts` (mesmo modelo da prévia).
//
// Retorna um Blob 'application/pdf' que pode ser:
//  - Compartilhado via navigator.share({ files: [file] }) — alvo principal
//  - Baixado via download anchor fallback
//
// Dynamic import do jsPDF pra não pesar o bundle inicial (~150kb gz).

import type { Quote } from '@/lib/types';
import { reportFailure } from '@/lib/utils/reportFailure';
import { abrirLinkExterno } from '@/lib/native';
import { fmtBRL } from '@/lib/utils';

/**
 * Texto que a fonte embutida do jsPDF consegue DESENHAR. A Helvetica dele
 * é WinAnsi (Latin-1): acento do pt-BR passa, mas emoji vira lixo na tela
 * ("Ø=ÜÌ" — visto em produção em 2026-08-30, no bloco ESCOPO TÉCNICO).
 * Tudo fora do alcance da fonte é removido; espaço duplicado, recolhido.
 */
export function textoPdfSeguro(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[^\n\r\t\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '');
}

/**
 * Tira emoji do texto que viaja em URL (wa.me, sms:). O wrapper decodifica
 * a URL errado e cada emoji chega como "�" no WhatsApp — melhor a linha
 * limpa ("Tipo: ...") que uma interrogação por item.
 */
export function semEmoji(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '');
}

export interface PainterForPdf {
  name?: string | null;
  tag?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  business_logo_url?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
}


// Carrega imagem como data URL pra jsPDF.addImage. Falha → null (segue sem logo).
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Gera o PDF do orçamento no layout de referência (LP Decor, 2026-09-08):
 * cabeçalho do profissional + "Orçamento nº", cliente + visita técnica,
 * tabela de serviços em cards, faixas de total, laudo/informações/pagamento,
 * "parte interna/externa", botões Recusar/Aprovar (links wa.me) e a página
 * "Área do profissional". O CONTEÚDO vem todo de `montarDocumento` — a
 * prévia HTML usa o mesmo modelo, então o que a pessoa vê na tela é o que
 * sai no arquivo.
 */
export async function generateQuotePdfBlob(
  quote: Quote,
  painter: PainterForPdf | null,
): Promise<Blob> {
  // Dynamic import pra não pesar bundle inicial.
  const { jsPDF } = await import('jspdf');
  const { montarDocumento, fmtValor, fmtQuantidade } = await import('@/lib/orcamentoDocumento');
  const d = montarDocumento(quote, painter);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const limite = pageH - 20; // acima do rodapé

  // Paleta da referência: preto, cinzas e branco (o laranja da marca fica
  // fora de propósito — o documento é do pintor, não do app).
  const PRETO = '#111111';
  const CINZA_FAIXA = '#cfcfcf';
  const CINZA_CLARO = '#e6e6e6';
  const BORDA = '#dddddd';
  const TEXTO = '#1a1a1a';
  const MUDO = '#555555';
  const VERDE = '#1aa64b';
  const VERMELHO = '#c62828';

  const t = (v: string) => textoPdfSeguro(v);
  const lh = (pt: number) => pt * 0.3528 * 1.3; // altura de linha em mm
  let y = margin;

  function rodape() {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(TEXTO);
      doc.text(t(`Documento gerado em ${d.geradoEm}`), pageW / 2, pageH - 8, { align: 'center' });
    }
  }
  function novaPagina() {
    doc.addPage();
    y = margin;
  }
  function garantir(h: number) {
    if (y + h > limite) novaPagina();
  }
  function texto(
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; maxW?: number },
  ): number {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(opts.color ?? TEXTO);
    const linhas = opts.maxW ? (doc.splitTextToSize(t(s), opts.maxW) as string[]) : [t(s)];
    doc.text(linhas, x, yy, { align: opts.align ?? 'left' });
    return linhas.length * lh(opts.size ?? 10);
  }
  function alturaTexto(s: string, size: number, maxW: number, bold = false): number {
    // A largura do texto depende do PESO da fonte: medir em negrito o que
    // sai em normal superestima as linhas e deixa o card com sobra embaixo.
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const linhas = doc.splitTextToSize(t(s), maxW) as string[];
    return linhas.length * lh(size);
  }
  function faixa(fill: string, h: number, radius = 2) {
    doc.setFillColor(fill);
    doc.roundedRect(margin, y, contentW, h, radius, radius, 'F');
  }
  function divisor(grosso = false) {
    doc.setDrawColor(CINZA_CLARO);
    doc.setLineWidth(grosso ? 1.4 : 0.5);
    doc.line(margin, y, pageW - margin, y);
  }

  // ── CABEÇALHO DO PROFISSIONAL ─────────────────────────────────────────
  const logo = d.profissional.logo ? await loadImageAsDataUrl(d.profissional.logo) : null;
  let textoX = margin;
  if (logo) {
    try {
      const fmt = logo.match(/^data:image\/(\w+);/)?.[1]?.toUpperCase() === 'PNG' ? 'PNG' : 'JPEG';
      doc.addImage(logo, fmt, margin, y, 26, 26);
      textoX = margin + 32;
    } catch {
      // logo inválido — segue sem
    }
  }
  const caixaW = 74;
  doc.setFillColor(CINZA_FAIXA);
  doc.roundedRect(pageW - margin - caixaW, y + 1, caixaW, 10, 2, 2, 'F');
  texto(`Orçamento nº ${d.numero}`, pageW - margin - caixaW / 2, y + 7.5, { size: 11, bold: true, align: 'center' });

  let hy = y + 6;
  texto(d.profissional.nome, textoX, hy, { size: 17, bold: true, maxW: pageW - margin - caixaW - textoX - 4 });
  hy += lh(17) + 1;
  hy += texto(d.profissional.rotulo, textoX, hy, { size: 11.5, bold: true });
  const linhasProf = [
    d.profissional.cnpj ? `CNPJ: ${d.profissional.cnpj}` : '',
    d.profissional.cpf ? `CPF: ${d.profissional.cpf}` : '',
    d.profissional.endereco,
    d.profissional.telefone,
    d.profissional.email,
  ].filter(Boolean);
  for (const l of linhasProf) {
    hy += 1;
    hy += texto(l, textoX, hy, { size: 9.5, maxW: contentW - (textoX - margin) });
  }
  y = Math.max(hy, y + (logo ? 30 : 0)) + 4;
  divisor(true);
  y += 8;

  // ── CLIENTE ───────────────────────────────────────────────────────────
  y += texto('Cliente', margin, y, { size: 12.5, bold: true });
  y += 1;
  if (d.cliente.nome) y += texto(d.cliente.nome, margin, y, { size: 10.5, bold: true });
  if (d.cliente.telefone) y += texto(d.cliente.telefone, margin, y, { size: 10 });
  if (d.cliente.enderecoLinha || d.cliente.cep) {
    const endW = contentW * 0.52;
    const hEnd = d.cliente.enderecoLinha ? texto(d.cliente.enderecoLinha, margin, y, { size: 10, maxW: endW }) : lh(10);
    if (d.cliente.cep) texto(`CEP: ${d.cliente.cep}`, margin + endW + 6, y + (hEnd > lh(10) ? lh(10) : 0), { size: 10 });
    y += hEnd;
  }
  y += 3;
  if (d.visitaTecnica) {
    faixa(CINZA_FAIXA, 16, 3);
    texto('Visita técnica em:', pageW / 2, y + 6.5, { size: 10, bold: true, align: 'center' });
    texto(d.visitaTecnica, pageW / 2, y + 12.5, { size: 10.5, align: 'center' });
    y += 16 + 4;
  } else {
    y += 2;
  }

  // ── SERVIÇOS ──────────────────────────────────────────────────────────
  garantir(30);
  doc.setFillColor(CINZA_FAIXA);
  doc.roundedRect(margin, y, contentW, 15, 3, 3, 'F');
  doc.rect(margin, y + 8, contentW, 7, 'F'); // cantos de baixo retos (emenda com a faixa preta)
  texto('Serviços', margin + 4, y + 10.5, { size: 16, bold: true });
  y += 15;
  doc.setFillColor(PRETO);
  doc.rect(margin, y, contentW, 14, 'F');
  const itemW = contentW * 0.5;
  const colW = (contentW - itemW) / 3;
  const colX = (i: number) => margin + itemW + colW * i + colW / 2;
  texto('Item', margin + 4, y + 8.5, { size: 10, bold: true, color: '#ffffff' });
  texto('Valor', colX(0), y + 5.5, { size: 10, bold: true, color: '#ffffff', align: 'center' });
  texto('Unitario', colX(0), y + 10.5, { size: 10, bold: true, color: '#ffffff', align: 'center' });
  texto('Quantidade', colX(1), y + 8.5, { size: 10, bold: true, color: '#ffffff', align: 'center' });
  texto('Subtotal', colX(2), y + 8.5, { size: 10, bold: true, color: '#ffffff', align: 'center' });
  y += 14 + 4;

  for (const grupo of d.grupos) {
    if (grupo.titulo) {
      garantir(12);
      faixa(CINZA_CLARO, 8, 2);
      texto(grupo.titulo, margin + 4, y + 5.5, { size: 10, bold: true });
      y += 8 + 3;
    }
    for (const it of grupo.itens) {
      const pad = 4;
      const descW = itemW - pad * 2;
      const hTitulo = alturaTexto(it.titulo, 10.5, descW, true);
      const hDesc = it.descricao ? alturaTexto(it.descricao, 9, descW) : 0;
      const hCard = Math.max(hTitulo + hDesc + pad * 2 - 1, 18);
      garantir(hCard + 3);
      doc.setFillColor('#ffffff');
      doc.setDrawColor(BORDA);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, contentW, hCard, 3, 3, 'FD');
      let ty = y + pad + lh(10.5) * 0.75;
      ty += texto(it.titulo, margin + pad, ty, { size: 10.5, bold: true, maxW: descW });
      if (it.descricao) texto(it.descricao, margin + pad, ty, { size: 9, maxW: descW });
      const meio = y + hCard / 2;
      const colunas: Array<[string, string]> = [
        [it.rotuloUnidade, fmtValor(it.valorUnitario)],
        ['Quantidade', fmtQuantidade(it.quantidade)],
        ['Valor', fmtValor(it.subtotal)],
      ];
      colunas.forEach(([rotulo, valor], i) => {
        texto(rotulo, colX(i), meio - 1, { size: 8.5, color: MUDO, align: 'center' });
        texto(valor, colX(i), meio + 3.5, { size: 9.5, bold: true, align: 'center' });
      });
      y += hCard + 3;
    }
  }

  // ── TOTAIS ────────────────────────────────────────────────────────────
  garantir(40);
  y += 1;
  doc.setFillColor(PRETO);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F');
  texto(`Valor total dos Serviços:   R$ ${fmtBRL(d.totais.totalServicos)}`, pageW - margin - 4, y + 8, {
    size: 12,
    bold: true,
    color: '#ffffff',
    align: 'right',
  });
  y += 12 + 5;
  const linhasTotais: Array<[string, string]> = [['Subtotal:', `R$ ${fmtBRL(d.totais.subtotal)}`]];
  if (d.totais.desconto > 0) linhasTotais.push(['Descontos:', `- R$ ${fmtBRL(d.totais.desconto)}`]);
  const hCinza = linhasTotais.length * 9 + 2;
  doc.setFillColor(CINZA_FAIXA);
  doc.rect(margin, y, contentW, hCinza, 'F');
  linhasTotais.forEach(([k, v], i) => {
    const ly = y + 6.5 + i * 9;
    texto(k, pageW - margin - 40, ly, { size: 10.5, bold: true, align: 'right' });
    texto(v, pageW - margin - 3, ly, { size: 10.5, bold: i === 0, align: 'right' });
  });
  y += hCinza;
  doc.setFillColor(PRETO);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F');
  doc.rect(margin, y, contentW, 4, 'F'); // emenda reta com a faixa cinza
  texto('Valor total:', pageW - margin - 40, y + 8.5, { size: 13, bold: true, color: '#ffffff', align: 'right' });
  texto(`R$ ${fmtBRL(d.totais.valorTotal)}`, pageW - margin - 3, y + 8.5, { size: 13, bold: true, color: '#ffffff', align: 'right' });
  y += 12 + 6;
  divisor();
  y += 8;

  // ── LAUDO / INFORMAÇÕES / PAGAMENTO / LOCAIS / APROVAÇÃO ──────────────
  // Laudo, informações, pagamento e locais seguem no fluxo (quebram só
  // quando não cabem) — forçar página nova aqui deixava a anterior vazia.
  function blocoTexto(titulo: string, corpo: string) {
    if (!corpo) return;
    garantir(20 + alturaTexto(corpo, 10.5, contentW));
    y += texto(titulo, margin, y, { size: 11.5, bold: true });
    y += 1;
    y += texto(corpo, margin, y, { size: 10.5, maxW: contentW });
    y += 3;
    divisor();
    y += 8;
  }
  blocoTexto('Laudo Técnico', d.laudoTecnico);
  blocoTexto('Informações adicionais', d.informacoesAdicionais);

  if (d.pagamento.formas.length > 0 || d.pagamento.chavePix) {
    garantir(40 + d.pagamento.formas.length * 7);
    doc.setFillColor(CINZA_FAIXA);
    doc.roundedRect(margin, y, contentW, 15, 3, 3, 'F');
    doc.rect(margin, y + 8, contentW, 7, 'F');
    texto('Pagamento', margin + 4, y + 10.5, { size: 15, bold: true });
    y += 15;
    doc.setFillColor(PRETO);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.roundedRect(margin, y + 5, contentW, 5, 2, 2, 'F');
    texto('Formas de pagamento', margin + 5, y + 6.5, { size: 9.5, bold: true, color: '#ffffff' });
    y += 10 + 6;
    for (const f of d.pagamento.formas) {
      y += texto(`•  ${f}`, margin + 5, y, { size: 10 }) + 2;
    }
    if (d.pagamento.chavePix) {
      y += 3;
      faixa(CINZA_FAIXA, 12, 3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(TEXTO);
      const rot = 'Chave PIX: ';
      doc.text(rot, margin + 5, y + 7.5);
      const wRot = doc.getTextWidth(rot);
      texto(d.pagamento.chavePix, margin + 5 + wRot, y + 7.5, { size: 10.5 });
      y += 12;
    }
    y += 5;
    divisor();
    y += 8;
  }

  if (d.locais.length > 0) {
    garantir(12 * d.locais.length + 10);
    for (const l of d.locais) {
      y += texto(l.titulo, margin, y, { size: 11, bold: true, maxW: contentW });
      y += 1;
      y += texto(l.texto, margin, y, { size: 10.5, maxW: contentW });
      y += 3;
    }
    divisor();
    y += 8;
  }

  // Botões Recusar / Aprovar: sem página de aprovação pelo cliente, os dois
  // abrem o WhatsApp do pintor com a mensagem pronta.
  if (d.aprovacao.aprovarUrl && d.aprovacao.recusarUrl) {
    garantir(22);
    const gap = 3;
    const bw = (contentW - gap) / 2;
    const bh = 16;
    doc.setFillColor('#ffffff');
    doc.setDrawColor(VERMELHO);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, bw, bh, 2, 2, 'FD');
    texto('Recusar', margin + bw / 2, y + 7, { size: 12, bold: true, color: VERMELHO, align: 'center' });
    texto('Toque aqui para recusar este orçamento.', margin + bw / 2, y + 12.5, { size: 8.5, align: 'center' });
    doc.link(margin, y, bw, bh, { url: d.aprovacao.recusarUrl });

    const ax = margin + bw + gap;
    doc.setFillColor(VERDE);
    doc.roundedRect(ax, y, bw, bh, 2, 2, 'F');
    texto('Aprovar orçamento', ax + bw / 2, y + 7, { size: 12, bold: true, color: '#ffffff', align: 'center' });
    texto('Toque aqui para aprovar este orçamento.', ax + bw / 2, y + 12.5, { size: 8.5, color: '#ffffff', align: 'center' });
    doc.link(ax, y, bw, bh, { url: d.aprovacao.aprovarUrl });
    y += bh + 6;
  }

  // ── ÁREA DO PROFISSIONAL ──────────────────────────────────────────────
  if (d.profissional.sobre) {
    novaPagina();
    y = margin + 8;
    y += texto('Área do profissional', margin, y, { size: 20, bold: true });
    y += 1;
    y += texto('Saiba mais sobre seu prestador de serviços.', margin, y, { size: 10.5 });
    y += 6;
    const pad = 6;
    const txtX = margin + pad + (logo ? 22 : 0);
    const txtW = contentW - pad * 2 - (logo ? 22 : 0);
    const hSobre = alturaTexto(d.profissional.sobre, 9.5, txtW);
    const hCard = pad + lh(14) + 3 + hSobre + pad;
    doc.setFillColor(CINZA_FAIXA);
    doc.roundedRect(margin, y, contentW, hCard, 4, 4, 'F');
    if (logo) {
      try {
        const fmt = logo.match(/^data:image\/(\w+);/)?.[1]?.toUpperCase() === 'PNG' ? 'PNG' : 'JPEG';
        doc.addImage(logo, fmt, margin + pad, y + pad, 16, 16);
      } catch {
        /* sem logo */
      }
    }
    let sy = y + pad + lh(14) * 0.8;
    sy += texto(d.profissional.nome, txtX, sy, { size: 14, bold: true, maxW: txtW });
    sy += 2;
    texto(d.profissional.sobre, txtX, sy, { size: 9.5, maxW: txtW });
    y += hCard + 6;
    divisor();

    // Contato no pé da página
    const fy = pageH - 30;
    doc.setDrawColor(CINZA_CLARO);
    doc.setLineWidth(0.5);
    doc.line(margin, fy - 6, pageW - margin, fy - 6);
    let ly = fy;
    ly += texto(d.profissional.nome, margin, ly, { size: 10, bold: true });
    if (d.profissional.cnpj) ly += texto(`CNPJ: ${d.profissional.cnpj}`, margin, ly, { size: 9.5 });
    if (d.profissional.email) texto(d.profissional.email, margin, ly, { size: 9.5 });
    let ry = fy + 2;
    if (d.profissional.endereco) ry += texto(d.profissional.endereco, pageW / 2, ry, { size: 9.5, maxW: contentW / 2 });
    if (d.profissional.telefone) texto(d.profissional.telefone, pageW / 2, ry, { size: 9.5 });
  }

  rodape();
  return doc.output('blob');
}

/**
 * Gera + baixa OU compartilha PDF do orçamento. Usa navigator.share({files})
 * quando disponível (mobile com share sheet nativo); fallback abre download.
 */
export async function shareOrDownloadQuotePdf(
  quote: Quote,
  painter: PainterForPdf | null,
  whatsapp?: WhatsAppFallback,
  onLink?: LinkPronto,
): Promise<ShareResult> {
  const blob = await generateQuotePdfBlob(quote, painter);
  return shareOrDownloadPdfBlob(
    blob,
    nomeArquivoOrcamento(quote),
    `Orçamento ${quote.service_type || ''}`.trim(),
    whatsapp,
    onLink,
  );
}

/**
 * Nome do arquivo do PDF: `orcamento-<numero>-<cliente>.pdf`.
 *
 * Antes era só `orcamento-<8 chars do id>.pdf`, e no app instalado nem
 * isso aparecia — o "Save As" abria com o campo VAZIO, porque o wrapper
 * recebia uma URL `blob:` e não tem de onde tirar nome. Quem salvava
 * ficava com um monte de arquivo sem identificação na pasta Downloads.
 *
 * O "número" são os mesmos 8 caracteres do id que o PDF imprime no
 * cabeçalho ("ORÇAMENTO #..."), então papel e arquivo batem. É recorte de
 * UUID: não se repete na prática.
 */
export function nomeArquivoOrcamento(quote: Quote): string {
  const numero = (quote.id || 'novo').slice(0, 8);
  const cliente = apelidoArquivo(quote.client_name || quote.client?.name || '');
  return `orcamento-${numero}${cliente ? '-' + cliente : ''}.pdf`;
}

/** Vira pedaço de nome de arquivo: sem acento, sem espaço, sem surpresa. */
function apelidoArquivo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export type ShareResult = 'shared' | 'shared-link' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Plano pro app instalado, onde NÃO existe share sheet: em vez de anexar o
 * arquivo, manda o LINK dele pelo WhatsApp. `text` é a mensagem que
 * acompanha; `phone` (dígitos, sem DDI) abre já na conversa do cliente.
 */
export interface WhatsAppFallback {
  text: string;
  phone?: string | null;
}

/**
 * Chamado no app instalado quando o PDF já está no ar e só falta escolher
 * PRA ONDE mandar. Quem passa isso mostra a própria lista de apps — é o
 * mais perto de uma tela de compartilhar que dá pra chegar sem build
 * nativo (ver a nota sobre `intent:` lá embaixo). Sem ele, vai direto pro
 * WhatsApp.
 */
export type LinkPronto = (url: string, texto: string, filename: string) => void;

/**
 * Compartilha OU baixa um Blob de PDF qualquer. Extraído do fluxo do
 * orçamento pra reuso (PDF do pedido da loja, etc.). É o caminho que
 * FUNCIONA dentro do WebView Android: `window.print()` é no-op lá (o
 * wrapper não implementa diálogo de impressão), mas o share sheet nativo
 * via navigator.share({files}) funciona — e o download por anchor cobre
 * desktop/navegador.
 */
export async function shareOrDownloadPdfBlob(
  blob: Blob,
  filename: string,
  title: string,
  whatsapp?: WhatsAppFallback,
  onLink?: LinkPronto,
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  // Tenta Web Share API com arquivo (Chrome Android, Safari iOS 15+).
  type Nav = Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  const nav = typeof navigator !== 'undefined' ? (navigator as Nav) : null;
  if (nav?.canShare && nav?.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title,
        text: 'Documento em anexo.',
      });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Cai pro download fallback se share falhar por outro motivo.
    }
  }

  // WebView Android sem share de arquivo: NENHUM canal local funciona no
  // wrapper — blob: o DownloadListener não lê ("Save As" vazio), e data:
  // o DownloadManager do Android recusa (só baixa http/https). O único
  // canal à prova de wrapper é um LINK HTTPS de verdade: sobe o PDF pro
  // Storage (bucket `exports`, Wave 41) e navega pra URL pública com
  // `?download=` — o Android baixa como qualquer download normal.
  // ATENÇÃO ao gate (2026-08-29): aqui havia `isAndroidWebView(ua)`, que
  // exige o token `wv` ou "WebIntoApp" no user agent. O wrapper NÃO tem
  // nenhum dos dois — os pings `scrollpin-diag` em produção chegaram todos
  // com `wv=false`. Ou seja: no app instalado esse gate dava FALSE e todo
  // este caminho era pulado; o compartilhar caía no branch de navegador,
  // com uma URL `blob:` que o wrapper não sabe nomear — o "Save As" abria
  // com o campo VAZIO. Agora o gate é só Android: navegador Android de
  // verdade já foi atendido pelo `navigator.share` acima, então quem chega
  // aqui é justamente quem não tem share de arquivo.
  const { isAndroid } = await import('@/lib/hooks/useAndroidWebViewScrollPin');
  if (isAndroid(navigator.userAgent || '')) {
    const url = await uploadPdfForLink(blob, filename);
    if (!url) {
      // NUNCA cair pra data URL aqui (tentado e revertido em 2026-08-29).
      // Havia um "último recurso" que transformava o PDF inteiro numa data
      // URL e colava no `href` de uma âncora. No WebView isso são megabytes
      // de string numa única atribuição: o app CONGELA e o Android mostra
      // "QueroUmaCor isn't responding". O remédio era pior que a doença —
      // e ainda mentia, dizendo "Download concluído".
      //
      // MAS: navegador Android DE VERDADE (Firefox etc., que não passou no
      // canShare de arquivo lá em cima) baixa por âncora+blob numa boa — só
      // no wrapper isso vira o "Save As" vazio. O discriminador é o
      // `navigator.share`: todo navegador Android real tem; a WebView do
      // wrapper não tem NENHUM. (Achado da revisão de 2026-08-30 — o gate
      // largado pra /Android/i tinha tirado o download local de quem podia
      // usá-lo.)
      if (typeof nav?.share === 'function') {
        const local = URL.createObjectURL(blob);
        clickDownloadAnchor(local, filename);
        setTimeout(() => URL.revokeObjectURL(local), 5000);
        return 'downloaded';
      }
      // Wrapper sem link: não há caminho — melhor falhar dizendo isso.
      return 'failed';
    }
    // Texto cortado em 1200: ele viaja dentro da URL do destino, e escopo
    // muito longo estoura o limite do intent do Android. O PDF tem tudo.
    // Sem emoji: o wrapper decodifica a URL errado e cada emoji chega "�".
    const texto = `${semEmoji(whatsapp?.text || title || '').slice(0, 1200)}\n\n${url}`;

    // NÃO TENTAR `intent:` COM ACTION_SEND AQUI (tentado e revertido em
    // 2026-08-29). A ideia era pedir a tela de compartilhar do próprio
    // Android; na prática o wrapper trata a URL do intent como DOWNLOAD:
    // abre o "Save As" com a URL inteira (milhares de caracteres) no campo
    // de nome, e salvar dali FECHA O APP. Nem por iframe escapa. Sem
    // `navigator.share`, não existe tela de compartilhar do sistema pelo
    // lado web — quem quiser escolher o app tem que ver uma lista NOSSA
    // (`onLink`), com destinos que são URLs comuns que o wrapper já sabe
    // abrir.
    if (onLink) {
      onLink(url, texto, filename);
      return 'shared-link';
    }

    if (whatsapp) {
      // Sem lista mas com destino: WhatsApp, o caminho conhecido.
      const alvo = waMeTarget(whatsapp.phone);
      const destino = alvo
        ? `https://wa.me/${alvo}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/?text=${encodeURIComponent(texto)}`;
      // O fallback `location.href` daqui era um gerador de "Sem conexão" na
      // casca: o Capacitor cancela a navegação de topo pro wa.me e carrega a
      // errorPath. `abrirLinkExterno` cobre os dois mundos.
      abrirLinkExterno(destino);
      return 'shared-link';
    }

    // Sem lista e sem WhatsApp = o chamador quer o ARQUIVO ("Salvar PDF").
    // Bug de 2026-08-29 corrigido em 2026-08-30: este caso caía no wa.me
    // vazio — quem pedia pra salvar era jogado no WhatsApp. `?download=`
    // liga o Content-Disposition: attachment e o DownloadManager baixa sem
    // navegar a página.
    window.location.href = urlParaBaixar(url, filename);
    return 'downloaded';
  }

  // Navegador: download direto via anchor + blob.
  const url = URL.createObjectURL(blob);
  clickDownloadAnchor(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

// Sobe o PDF pro bucket público `exports` (SQL Wave 41: escrita só no
// próprio path userId/..., leitura pública) e devolve a URL com
// `?download=` (Content-Disposition: attachment). Best-effort: null =
// caller usa o fallback local.
async function uploadPdfForLink(blob: Blob, filename: string): Promise<string | null> {
  // 1) Sessão com TETO. `getSession()` pode fazer refresh pela rede e, no
  //    WebView, promessa pendurada não rejeita nunca (regra do boot,
  //    2026-08-22) — sem o race o toque ficava "pensando" pra sempre.
  let uid = '';
  let token = '';
  let sb: Awaited<ReturnType<typeof importaSupabase>> | null = null;
  try {
    sb = await importaSupabase();
    const result = await Promise.race([
      sb.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    uid = result?.data.session?.user?.id || '';
    token = result?.data.session?.access_token || '';
  } catch {
    // Sem cliente/sessão: os dois caminhos abaixo vão reportar.
  }

  // 2) Caminho principal: a ROTA. Além de imune a policy (service role) e
  //    de criar o bucket se faltar, é ela que devolve o LINK CURTO
  //    (queroumacor.com.br/pdf/<id>) — o endereço gigante do Supabase no
  //    WhatsApp era queixa do usuário (2026-08-30).
  if (token) {
    try {
      const chamarRota = (t: string) =>
        fetch('/api/quote-pdf-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            Authorization: `Bearer ${t}`,
            'x-filename': filename,
          },
          body: blob,
        });

      let r = await chamarRota(token);

      if (r.status === 401 && sb) {
        // Visto em produção (2026-08-30): token com assinatura válida que o
        // GoTrue não reconhece mais — sessão rotacionada (app + Chrome na
        // mesma conta). Renovar a sessão UMA vez resolve; com teto, porque
        // no WebView promessa de rede pendurada não rejeita nunca.
        try {
          const renovada = await Promise.race([
            sb.auth.refreshSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          const novoToken = renovada?.data.session?.access_token;
          if (novoToken && novoToken !== token) r = await chamarRota(novoToken);
        } catch {
          // Renovação falhou: o 401 original segue pro report abaixo.
        }
      }

      if (r.ok) {
        const j = (await r.json().catch(() => null)) as { url?: string } | null;
        if (j?.url) return j.url;
      } else {
        const corpo = await r.text().catch(() => '');
        reportFailure('pdf-link-fail', new Error(`rota ${r.status}: ${corpo.slice(0, 200)}`), {
          userId: uid || null,
          ctx: 'exports-rota',
        });
      }
    } catch (e) {
      reportFailure('pdf-link-fail', e, { userId: uid || null, ctx: 'exports-rota' });
    }
  } else {
    reportFailure('pdf-link-fail', new Error('sem sessao'), { ctx: 'exports-rota' });
  }

  // 3) Reserva: upload direto do app pro bucket (precisa das policies da
  //    Wave 41). O link sai no formato longo do Storage — funciona, só não
  //    é bonito. Melhor um link feio que nenhum.
  if (uid && sb) {
    try {
      const path = `${uid}/${Date.now()}-${filename}`;
      const up = await sb.storage
        .from('exports')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (!up.error) {
        const pub = sb.storage.from('exports').getPublicUrl(path);
        if (pub.data?.publicUrl) return pub.data.publicUrl;
      } else {
        reportFailure('pdf-link-fail', up.error, { userId: uid, ctx: 'exports-direto' });
      }
    } catch (e) {
      reportFailure('pdf-link-fail', e, { userId: uid, ctx: 'exports-direto' });
    }
  }
  return null;
}

async function importaSupabase() {
  const { getSupabase } = await import('@/lib/supabase');
  return getSupabase();
}

/**
 * Dígitos prontos pro wa.me, na REGRA DO REPO (2026-08-28, a mesma do
 * `normalizeWhatsAppTarget` do servidor): 12+ dígitos = já tem DDI, passa
 * verbatim; 11 dígitos SÓ é celular BR se o 3º for 9 (o contato dos EUA
 * `16503154274` tem 11 e não é); 10-11 BR locais ganham '55'. O `'55' +`
 * cego daqui era exatamente o erro que derrubou o envio com 502.
 */
export function waMeTarget(raw: string | null | undefined): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length > 11) return d;
  if (d.length === 11 && d[2] !== '9') return d;
  if (d.length >= 10) return '55' + d;
  return d;
}

/** Mesma URL, mas pedindo download em vez de abrir. */
export function urlParaBaixar(url: string, filename: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`;
}

function clickDownloadAnchor(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 100);
}
