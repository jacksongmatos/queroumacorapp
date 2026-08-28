// orderPdf.ts — PDF da "Lista de Pedido" da loja (jsPDF puro, mesmo padrão
// do quotePdf.ts). Motivação (2026-08-28): o botão "Baixar PDF" do
// pedido-confirmado chamava window.print(), que é NO-OP dentro do WebView
// Android (o wrapper não implementa diálogo de impressão) — o toque não
// fazia nada. Agora gera um Blob de verdade e entrega pelo share sheet
// nativo (ou download, fora do app) via shareOrDownloadPdfBlob.
//
// Sem preços de propósito: a loja fecha a venda fora do app (compliance
// Apple 3.1.3(e) — o app só monta a lista; pagamento é combinado com a
// Cali Colors via WhatsApp).

import { shareOrDownloadPdfBlob } from './quotePdf';

export interface OrderPdfItem {
  name?: string | null;
  volume?: string | null;
  qty?: number | null;
}

export interface OrderForPdf {
  id: string;
  items: OrderPdfItem[];
  created_at: string;
  delivery_address?: string | null;
}

const INK = '#1a1a2e';
const ORANGE = '#ff6b35';
const MUTED = '#6b6457';

export async function generateOrderPdfBlob(order: OrderForPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  // Cabeçalho: marca + identificação da loja.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(INK);
  doc.text('QueroUmaCor', margin, y + 6);
  doc.setFontSize(10);
  doc.setTextColor(ORANGE);
  doc.text('LISTA DE PEDIDO', pageW - margin, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const date = new Date(order.created_at).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(date, pageW - margin, y + 5, { align: 'right' });
  doc.text(`#${order.id.slice(0, 8)}`, pageW - margin, y + 10, { align: 'right' });
  y += 12;
  doc.text('Cali Colors — CALICOLORS TINTAS LTDA · CNPJ 47.677.346/0001-92', margin, y);
  y += 4;
  doc.text('Est. Pres. Juscelino Kubitschek de Oliveira, 1071 — Guarulhos/SP', margin, y);
  y += 4;
  doc.text('WhatsApp (11) 95976-5031 · loja@calicolors.com.br', margin, y);
  y += 4;

  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Itens.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INK);
  const totalUnits = order.items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
  doc.text(`Itens (${totalUnits} unidade${totalUnits === 1 ? '' : 's'})`, margin, y);
  y += 6;

  doc.setFontSize(10);
  for (const it of order.items) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    const nameLines = doc.splitTextToSize(String(it.name || 'Produto'), pageW - margin * 2 - 22);
    doc.text(nameLines, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    doc.text(`Qtd: ${Number(it.qty) || 1}`, pageW - margin, y, { align: 'right' });
    y += nameLines.length * 4.5;
    if (it.volume) {
      doc.text(String(it.volume), margin, y);
      y += 4.5;
    }
    doc.setDrawColor(232, 226, 217);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  }

  if (order.delivery_address) {
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    doc.text('Endereço de entrega', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    const addrLines = doc.splitTextToSize(order.delivery_address, pageW - margin * 2);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 4.5;
  }

  // Rodapé.
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(
    'Valores e pagamento são combinados diretamente com a equipe da Cali Colors.',
    margin,
    Math.min(y, pageH - 20),
  );
  doc.text(`Gerado via QueroUmaCor · ID ${order.id}`, margin, Math.min(y + 4.5, pageH - 15));

  return doc.output('blob');
}

/** Gera + compartilha/baixa o PDF da lista de pedido. */
export async function shareOrDownloadOrderPdf(
  order: OrderForPdf,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await generateOrderPdfBlob(order);
  return shareOrDownloadPdfBlob(blob, `pedido-${order.id.slice(0, 8)}.pdf`, 'Lista de Pedido — Cali Colors');
}
