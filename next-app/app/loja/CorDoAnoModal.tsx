// CorDoAnoModal — aviso rápido com as Cores do Ano das fabricantes, mostrado
// UMA vez por aparelho quando a pessoa abre a Loja.
//
// Duas notas de implementação:
//
//  1. NÃO MEXE NO HISTÓRICO. O StoryViewer e o leitor da Click Rua empurram
//     uma entrada pra o VOLTAR do Android fechar o overlay, mas os dois são
//     tela cheia e imersivos. Aqui o `BackGuard` já cuida do voltar, e este
//     modal vive dentro da /loja: voltar sai da Loja e o modal some junto.
//     Empilhar entrada por causa de um diálogo de um botão só arriscaria a
//     sentinela do BackGuard sem ganho nenhum.
//
//  2. FECHOU DE QUALQUER JEITO = VISTO. Entendi, Esc, toque no fundo — os
//     três marcam. Reabrir na próxima visita algo que a pessoa acabou de
//     fechar é o comportamento que faz gente ignorar aviso.

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ANO_DAS_CORES,
  CORES_DO_ANO,
  jaViuCoresDoAno,
  marcarCoresDoAnoVistas,
  textoSobre,
} from '@/lib/coresDoAno';

// Respiro pra a Loja pintar antes. Sem ele o modal nasce por cima do
// esqueleto de carregamento, e o primeiro quadro do app é um diálogo.
const ATRASO_MS = 450;

export function CorDoAnoModal() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (jaViuCoresDoAno()) return undefined;
    const t = setTimeout(() => setAberto(true), ATRASO_MS);
    return () => clearTimeout(t);
  }, []);

  const fechar = useCallback(() => {
    marcarCoresDoAnoVistas();
    setAberto(false);
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, fechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 modal-fade"
      style={{ background: 'rgba(0,0,0,.55)' }}
      onClick={fechar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cor-do-ano-titulo"
        onClick={(e) => e.stopPropagation()}
        className="modal-pop w-full max-w-[380px] max-h-full overflow-y-auto rounded-2xl shadow-2xl"
        style={{
          background: 'var(--color-white)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Faixa das cores: o assunto do modal aparece antes do texto. */}
        <div className="flex h-3" aria-hidden="true">
          {CORES_DO_ANO.map((c) => (
            <div key={c.codigo} className="flex-1" style={{ background: c.hex }} />
          ))}
        </div>

        <div className="p-5">
          <p
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-p1)' }}
          >
            Cores do Ano
          </p>
          <h2
            id="cor-do-ano-titulo"
            className="text-2xl font-extrabold leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}
          >
            {ANO_DAS_CORES}
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            {CORES_DO_ANO.map((cor) => (
              <div key={`${cor.marca}-${cor.codigo}`} className="flex items-center gap-3">
                <div
                  className="w-16 h-16 shrink-0 rounded-xl flex items-center justify-center text-[10px] font-bold tracking-wide"
                  style={{
                    background: cor.hex,
                    color: textoSobre(cor.hex),
                    border: '1px solid rgba(0,0,0,.12)',
                  }}
                >
                  {cor.hex.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {cor.marca}
                  </p>
                  <p
                    className="font-bold leading-snug"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    {cor.nome}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-ink2)' }}>
                    {cor.codigo}
                    {cor.ncs ? ` · ${cor.ncs}` : ''}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {cor.descricao}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            A cor da tela é aproximada. Peça pelo código no balcão — é ele que
            manda na hora de preparar a tinta.
          </p>

          <button
            type="button"
            onClick={fechar}
            autoFocus
            className="mt-4 w-full rounded-xl py-3 font-bold text-white active:scale-[.98] transition-transform"
            style={{ background: 'var(--color-p1)' }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
