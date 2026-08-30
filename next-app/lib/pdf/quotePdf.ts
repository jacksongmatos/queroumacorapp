// quotePdf.ts — gera Blob de PDF do orçamento usando jsPDF puro (sem html2canvas
// que adicionaria ~200kb). Layout A4 portrait com:
//   - Cabeçalho: logo + nome do pintor + contato + "ORÇAMENTO #id + data"
//   - Bloco cliente (border-left roxa)
//   - Tabela de detalhes do serviço
//   - Bloco escopo (parágrafo)
//   - Card valor total
//   - Rodapé com data de emissão
//
// Retorna um Blob 'application/pdf' que pode ser:
//  - Compartilhado via navigator.share({ files: [file] }) — alvo principal
//  - Baixado via download anchor fallback
//
// Dynamic import do jsPDF pra não pesar o bundle inicial (~150kb gz).

import type { Quote } from '@/lib/types';
import { reportFailure } from '@/lib/utils/reportFailure';

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

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const PRIMARY = '#FF6B35';
const ACCENT = '#8338ec';
const INK = '#1a1a2e';
const MUTED = '#888888';

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

// Extrai dados de quote_data jsonb com fallback seguro.
function readField(qd: unknown, key: string): string {
  if (!qd || typeof qd !== 'object') return '';
  const v = (qd as Record<string, unknown>)[key];
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ');
  return '';
}
function readBool(qd: unknown, key: string): boolean | null {
  if (!qd || typeof qd !== 'object') return null;
  const v = (qd as Record<string, unknown>)[key];
  return typeof v === 'boolean' ? v : null;
}

export async function generateQuotePdfBlob(
  quote: Quote,
  painter: PainterForPdf | null,
): Promise<Blob> {
  // Dynamic import pra não pesar bundle inicial.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;

  const today = new Date().toLocaleDateString('pt-BR');
  const price = Number(quote.price) || 0;
  const warranty = ((quote.quote_data as { warranty?: string } | null)?.warranty) || '';
  const qd = quote.quote_data;

  // Prioridade: name primeiro, business_name como fallback. Antes priorizávamos
  // business_name (legado vanilla salvava label do logo da camisa lá), o que
  // poluía os PDFs com nomes de teste antigos.
  const painterName =
    painter?.name ||
    painter?.business_name ||
    (painter?.tag ? '@' + painter.tag : 'Pintor');
  const painterTag = painter?.tag ? '@' + painter.tag : '';
  const painterPhone = painter?.phone || '';
  const painterEmail = painter?.email || '';
  const painterCity =
    painter?.city && painter?.state
      ? `${painter.city}/${painter.state}`
      : painter?.city || '';

  // ── CABEÇALHO ─────────────────────────────────────────────────────────
  const logoUrl = painter?.business_logo_url || painter?.avatar_url || '';
  let cursorY = margin;
  let textX = margin;

  if (logoUrl) {
    const dataUrl = await loadImageAsDataUrl(logoUrl);
    if (dataUrl) {
      try {
        const ext = dataUrl.match(/^data:image\/(\w+);/)?.[1]?.toUpperCase() || 'JPEG';
        const fmt = ext === 'PNG' ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, fmt, margin, cursorY, 18, 18);
        textX = margin + 22;
      } catch {
        // Imagem inválida — segue sem logo.
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text(painterName, textX, cursorY + 6);

  if (painterTag) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text(painterTag, textX, cursorY + 11);
  }

  // Badge "ORÇAMENTO" à direita
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(PRIMARY);
  doc.text('ORÇAMENTO', pageW - margin, cursorY + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(today, pageW - margin, cursorY + 11, { align: 'right' });
  doc.text(`#${(quote.id || '').slice(0, 8)}`, pageW - margin, cursorY + 15, {
    align: 'right',
  });

  cursorY += 21;

  // Linha de contato (debaixo do nome)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  const contactParts = [
    painterPhone ? `Tel: ${painterPhone}` : '',
    painterEmail ? `E-mail: ${painterEmail}` : '',
    painterCity ? `${painterCity}` : '',
  ].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('   ·   '), margin, cursorY);
    cursorY += 4;
  }

  // Linha separadora laranja
  doc.setDrawColor(PRIMARY);
  doc.setLineWidth(0.8);
  doc.line(margin, cursorY + 2, pageW - margin, cursorY + 2);
  cursorY += 8;

  // ── BLOCO CLIENTE ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text('CLIENTE', margin, cursorY);
  cursorY += 4;

  // Card cinza com border-left roxa
  const cardY = cursorY;
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, cardY, contentW, 14, 2, 2, 'F');
  doc.setFillColor(ACCENT);
  doc.rect(margin, cardY, 1.2, 14, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(quote.client_name || 'Cliente não informado', margin + 4, cardY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  const clientLine = [
    quote.client_phone ? `Tel: ${quote.client_phone}` : '',
    quote.address ? `End: ${quote.address}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');
  if (clientLine) {
    doc.text(clientLine, margin + 4, cardY + 10);
  }
  cursorY = cardY + 18;

  // ── TABELA DE DETALHES ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text('DETALHES DO SERVIÇO', margin, cursorY);
  cursorY += 4;

  const rows: Array<[string, string]> = [];
  const push = (k: string, v: string | null | undefined) => {
    if (v && v !== '—') rows.push([k, String(v)]);
  };

  push('Serviço', quote.service_type || quote.title || '');
  push('Área', quote.area_m2 ? `${quote.area_m2} m²` : '');
  push('Tipo de tinta', readField(qd, 'paintType'));
  push('Cor', readField(qd, 'colorWant'));
  push('Demãos', readField(qd, 'coats'));
  push('Preparação', readField(qd, 'prep'));
  push('Superfície', readField(qd, 'surfaceState'));
  push('Acesso', readField(qd, 'access'));
  push('Prazo de conclusão', quote.proposed_date);
  const im = readBool(qd, 'includeMaterial');
  if (im !== null) push('Inclui material', im ? 'Sim' : 'Não');
  const il = readBool(qd, 'includeLabor');
  if (il !== null) push('Inclui mão de obra', il ? 'Sim' : 'Não');
  push('Garantia', warranty);

  doc.setFontSize(9);
  doc.setTextColor(INK);
  const labelW = 38;
  const valueX = margin + labelW + 2;
  for (const [k, v] of rows) {
    if (cursorY > 270) {
      doc.addPage();
      cursorY = margin;
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    doc.text(k, margin, cursorY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    const wrapped = doc.splitTextToSize(v, contentW - labelW - 2) as string[];
    doc.text(wrapped, valueX, cursorY);
    const lines = wrapped.length;
    // Linha tracejada divisora
    doc.setDrawColor(238, 238, 238);
    doc.setLineWidth(0.15);
    doc.line(margin, cursorY + lines * 3.5 + 1, pageW - margin, cursorY + lines * 3.5 + 1);
    cursorY += lines * 3.5 + 3;
  }

  // ── ESCOPO TÉCNICO ────────────────────────────────────────────────────
  if (quote.description) {
    cursorY += 4;
    if (cursorY > 250) {
      doc.addPage();
      cursorY = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text('ESCOPO TÉCNICO', margin, cursorY);
    cursorY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(INK);
    const scopeLines = doc.splitTextToSize(quote.description, contentW) as string[];
    for (const line of scopeLines) {
      if (cursorY > 280) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(line, margin, cursorY);
      cursorY += 4;
    }
  }

  // ── VALOR TOTAL ──────────────────────────────────────────────────────
  cursorY += 6;
  if (cursorY > 250) {
    doc.addPage();
    cursorY = margin;
  }
  const valY = cursorY;
  // Card com border laranja
  doc.setFillColor(255, 244, 237);
  doc.setDrawColor(PRIMARY);
  doc.setLineWidth(0.7);
  doc.roundedRect(margin, valY, contentW, 20, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text('VALOR TOTAL', margin + 5, valY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('À combinar forma e parcelamento', margin + 5, valY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(PRIMARY);
  const priceTxt = price > 0 ? BRL.format(price) : '—';
  doc.text(priceTxt, pageW - margin - 5, valY + 12, { align: 'right' });
  cursorY = valY + 24;

  // ── RODAPÉ ───────────────────────────────────────────────────────────
  cursorY += 4;
  doc.setDrawColor(229, 229, 229);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Gerado em ${today} via QueroUmaCor`, margin, cursorY);
  doc.text('Validade: 15 dias da emissão', pageW - margin, cursorY, {
    align: 'right',
  });

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
export type LinkPronto = (url: string, texto: string) => void;

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
      // Sem link não há caminho: melhor falhar dizendo isso.
      return 'failed';
    }
    // Texto cortado em 1200: ele viaja dentro da URL do destino, e escopo
    // muito longo estoura o limite do intent do Android. O PDF tem tudo.
    const texto = `${(whatsapp?.text || title || '').slice(0, 1200)}\n\n${url}`;

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
      onLink(url, texto);
      return 'shared-link';
    }

    if (whatsapp) {
      // Sem lista mas com destino: WhatsApp, o caminho conhecido.
      const digitos = (whatsapp.phone || '').replace(/\D/g, '');
      const destino = digitos
        ? `https://wa.me/${digitos.length > 11 ? digitos : '55' + digitos}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/?text=${encodeURIComponent(texto)}`;
      // window.open costuma ser barrado (já saímos do gesto do toque no
      // await do upload); o wrapper intercepta o wa.me na navegação.
      const aba = window.open(destino, '_blank', 'noopener,noreferrer');
      if (!aba) window.location.href = destino;
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
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    const result = await Promise.race([
      sb.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    uid = result?.data.session?.user?.id || '';
    token = result?.data.session?.access_token || '';

    // 2) Caminho rápido: upload direto do app pro bucket. Quando o bucket e
    //    as policies estão certos, resolve sem passar pelo edge.
    if (uid) {
      const path = `${uid}/${Date.now()}-${filename}`;
      const up = await sb.storage
        .from('exports')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (!up.error) {
        const pub = sb.storage.from('exports').getPublicUrl(path);
        // URL CRUA, sem `?download=`: o link ABRE o PDF em vez de baixar
        // calado. Quem quer salvar usa `urlParaBaixar()`.
        if (pub.data?.publicUrl) return pub.data.publicUrl;
      } else {
        reportFailure('pdf-link-fail', up.error, { userId: uid, ctx: 'exports-direto' });
      }
    }
  } catch (e) {
    reportFailure('pdf-link-fail', e, { userId: uid || null, ctx: 'exports-direto' });
  }

  // 3) Plano B — o SERVIDOR sobe (2026-08-30). Em produção o upload direto
  //    falhou desde o primeiro dia (bucket/policy/sessão — qualquer um cala
  //    o caminho de cima). A rota usa a service role, então não depende de
  //    policy, e cria o próprio bucket se ele não existir. Só precisa do
  //    token do usuário.
  if (!token) {
    reportFailure('pdf-link-fail', new Error('sem sessao pro plano B'), { ctx: 'exports-rota' });
    return null;
  }
  try {
    const r = await fetch('/api/quote-pdf-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        Authorization: `Bearer ${token}`,
        'x-filename': filename,
      },
      body: blob,
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      reportFailure('pdf-link-fail', new Error(`rota ${r.status}: ${corpo.slice(0, 200)}`), {
        userId: uid || null,
        ctx: 'exports-rota',
      });
      return null;
    }
    const j = (await r.json().catch(() => null)) as { url?: string } | null;
    return j?.url || null;
  } catch (e) {
    reportFailure('pdf-link-fail', e, { userId: uid || null, ctx: 'exports-rota' });
    return null;
  }
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
