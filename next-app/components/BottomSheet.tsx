// BottomSheet — modal "janela que sobe" estilo vanilla (`.overlay` +
// `.sheet`). Click no backdrop ou tecla Esc fecha. X pequeno no
// canto superior direito do sheet. Body scroll lock enquanto aberto.
// Conteúdo scrolla sem barra visível (.hide-scrollbar global).
'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

export function BottomSheet({ open, onClose, children, ariaLabel }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{
        background: 'rgba(0,0,0,.55)',
        animation: 'bsFade 160ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full mx-auto bg-white flex flex-col"
        style={{
          maxWidth: 430,
          // `dvh` e não `vh`: no Safari do iPhone o `vh` inclui a área atrás
          // das barras do navegador, então o rodapé do sheet (o botão de
          // ação) nascia fora da vista.
          maxHeight: '92dvh',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 30px rgba(0,0,0,.3)',
          animation: 'bsSlideUp 220ms cubic-bezier(.32,.72,0,1)',
        }}
      >
        {/* Cabeçalho FIXO (handle + X). Antes o X era `absolute` dentro do
            container que rolava: em sheet com conteúdo longo (Publicar,
            Orçamento) ele subia junto com o conteúdo e sumia da tela — não
            dava pra fechar sem Esc/backdrop. Agora o cabeçalho é um irmão
            do corpo rolável, então o X fica sempre visível. */}
        <div
          className="relative flex-shrink-0 flex items-center justify-center"
          style={{
            background: 'var(--color-white)',
            padding: '10px 14px 6px',
            borderRadius: '20px 20px 0 0',
          }}
        >
          <span
            aria-hidden="true"
            className="rounded-full"
            style={{
              width: 40,
              height: 4,
              background: 'rgba(0,0,0,.18)',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute"
            style={{
              top: 6,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.07)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Corpo rolável. O padding de baixo soma a safe area pra que o
            último botão não fique embaixo da barrinha do iPhone. */}
        <div
          className="hide-scrollbar"
          style={{
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '4px 18px 24px',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </div>
      </div>
      <style>{`
        @keyframes bsFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bsSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
