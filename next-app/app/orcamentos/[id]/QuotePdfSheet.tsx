'use client';
// QuotePdfSheet — preview formatado pra impressão/PDF. Renderiza um layout
// A4-ready com: cabeçalho com business_logo do pintor + dados completos
// (nome, tag, telefone, cidade, email), bloco do cliente (nome, telefone,
// endereço), tabela de detalhes do serviço, escopo, observações, valor
// destacado, e rodapé com data + branding.
//
// Usa @media print pra esconder tudo fora do .quote-pdf-content quando o
// browser entra em modo impressão — o user salva como PDF pelo diálogo
// nativo ("Salvar como PDF"). Sem jspdf — economiza 150kb.

import { useState } from 'react';
import { showToast } from '@/lib/toast';
import type { Quote } from '@/lib/types';
import { montarDocumento } from '@/lib/orcamentoDocumento';
import { OrcamentoDocumento } from '@/components/orcamento/OrcamentoDocumento';

interface PainterProfile {
  name?: string | null;
  tag?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  business_logo_url?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
}

export interface QuotePdfSheetProps {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  painter: PainterProfile | null;
}

export function QuotePdfSheet({ open, onClose, quote, painter }: QuotePdfSheetProps) {
  // "Imprimir / Salvar PDF": window.print() é NO-OP dentro do WebView
  // Android (o wrapper não tem diálogo de impressão — o toque não fazia
  // nada). Agora gera o PDF de verdade (jsPDF, mesmo layout do
  // compartilhar) e entrega pelo share sheet nativo / download.
  const [pdfBusy, setPdfBusy] = useState(false);
  async function handlePdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const { shareOrDownloadQuotePdf } = await import('@/lib/pdf/quotePdf');
      const r = await shareOrDownloadQuotePdf(quote, painter);
      // Sem isto o toque nao dizia nada: no app empacotado o arquivo cai
      // na pasta Downloads e a tela fica igual — o pintor nao sabe se
      // gerou. (No navegador o share sheet ja e o proprio aviso.)
      if (r === 'downloaded') {
        showToast('PDF salvo no aparelho (pasta Downloads).', 'success');
      } else if (r === 'failed') {
        // No app instalado o PDF precisa subir pro Storage — sem isso não
        // há como entregar. Antes daqui saía uma data URL gigante que
        // CONGELAVA o app; agora falha dizendo o que aconteceu.
        showToast('Não consegui preparar o PDF agora. Tente de novo em instantes.', 'error');
      }
    } catch {
      // Último recurso: diálogo de impressão (funciona no navegador).
      try { window.print(); } catch { /* no-op */ }
    } finally {
      setPdfBusy(false);
    }
  }

  if (!open) return null;

  // O MESMO modelo do PDF (jsPDF): prévia e arquivo nunca discordam.
  const doc = montarDocumento(quote, painter);

  return (
    <>
      {/* Print styles: esconde tudo exceto .quote-pdf-content. Layout A4 limpo. */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          .quote-pdf-content, .quote-pdf-content * { visibility: visible !important; }
          .quote-pdf-content {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #1a1a2e !important;
            box-shadow: none !important;
          }
          .quote-pdf-noprint { display: none !important; }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 quote-pdf-noprint flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,.6)', padding: 12 }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white"
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '92vh',
            overflowY: 'auto',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <header
            className="flex items-center justify-between quote-pdf-noprint"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e5e5',
              flexShrink: 0,
            }}
          >
            <h2 className="font-bold text-sm">Preview do orçamento (PDF)</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
            >
              ✕
            </button>
          </header>

          {/* Conteúdo do PDF — padding mobile-friendly. @media print aumenta
              pra 24mm via @page no <style> acima. */}
          <article
            className="quote-pdf-content"
            style={{
              padding: 18,
              background: '#fff',
              color: '#1a1a1a',
              fontFamily: 'DM Sans, system-ui, sans-serif',
              lineHeight: 1.5,
              overflow: 'hidden',
            }}
          >
            <OrcamentoDocumento doc={doc} />
          </article>

          <footer
            className="quote-pdf-noprint flex gap-2"
            style={{
              padding: 12,
              borderTop: '1px solid #e5e5e5',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 font-bold text-sm"
              style={{
                padding: 11,
                background: '#fff',
                color: '#1a1a2e',
                borderRadius: 10,
                border: '1.5px solid #e5e5e5',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handlePdf}
              disabled={pdfBusy}
              className="flex-1 font-bold text-white text-sm"
              style={{
                padding: 11,
                background: 'linear-gradient(135deg, #FF6B35, #8338ec)',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {pdfBusy ? 'Gerando…' : '🖨️ Salvar PDF'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
