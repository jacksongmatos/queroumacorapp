'use client';
// ServicosDoOrcamento — a seção "Serviços" do tile Orçamento (Crie e envie).
//
// O pintor monta o orçamento como uma lista de serviços: escolhe cada um na
// Tabela de Preços da ABRAPP (o mesmo catálogo do tile "Tabela de Preços"),
// informa quantidade e VALOR — que nasce vazio, com a sugestão da tabela do
// lado (mín/média/máx). Também dá pra incluir um serviço avulso, pra quem
// faz o que a tabela não cobre (grafite, automotivo).
//
// Por que o seletor é um modal em portal e não uma lista inline: o wizard já
// abre dentro de um BottomSheet (z-[1000]); uma lista de 328 itens dentro
// dele viraria rolagem dentro de rolagem, e o iOS prende o gesto a um
// scroller só. O modal precisa de z-index ACIMA de 1000 (lição do leitor do
// Click Rua: overlay aberto de dentro de um sheet abaixo disso fica atrás).

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePriceTable } from '@/lib/hooks/usePriceTable';
import {
  filtrarPrecos,
  listarCategorias,
  rotuloAltura,
  semValorPublicado,
  unidadeCurta,
  type PriceAltura,
  type PriceItem,
} from '@/lib/services/priceTable';
import {
  alturaDoAcesso,
  servicoAvulso,
  servicoDoItemDaTabela,
  subtotalDoServico,
  subtotalSugerido,
  totaisDosServicos,
  type ServicoDoOrcamento,
} from '@/lib/orcamentoServicos';
import { fmtBRL } from '@/lib/utils';

export interface ServicosDoOrcamentoProps {
  servicos: ServicoDoOrcamento[];
  onChange: (next: ServicoDoOrcamento[]) => void;
  /** campo "Acesso" do orçamento — só pra pré-selecionar o filtro de altura */
  access?: string;
}

export function ServicosDoOrcamento({ servicos, onChange, access }: ServicosDoOrcamentoProps) {
  const [seletorAberto, setSeletorAberto] = useState(false);
  const totais = useMemo(() => totaisDosServicos(servicos), [servicos]);

  function atualizar(id: string, patch: Partial<ServicoDoOrcamento>) {
    onChange(servicos.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function remover(id: string) {
    onChange(servicos.filter((s) => s.id !== id));
  }
  function adicionarDaTabela(item: PriceItem) {
    onChange([...servicos, servicoDoItemDaTabela(item)]);
    setSeletorAberto(false);
  }
  function adicionarAvulso() {
    onChange([...servicos, servicoAvulso()]);
  }

  return (
    <div className="space-y-3">
      {servicos.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          Adicione os serviços do orçamento. O valor de cada um fica em branco pra você
          decidir — a sugestão da Tabela ABRAPP (mão de obra) aparece do lado.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Serviços do orçamento">
          {servicos.map((s) => (
            <LinhaDeServico
              key={s.id}
              servico={s}
              onChange={(patch) => atualizar(s.id, patch)}
              onRemove={() => remover(s.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSeletorAberto(true)}
          className="font-bold text-sm"
          style={{
            flex: '1 1 auto',
            padding: '10px 12px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--color-p1)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          📊 Adicionar da Tabela de Preços
        </button>
        <button
          type="button"
          onClick={adicionarAvulso}
          className="font-bold text-sm"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1.5px solid var(--color-border)',
            background: 'var(--color-white)',
            color: 'var(--color-ink)',
            cursor: 'pointer',
          }}
        >
          + Avulso
        </button>
      </div>

      {servicos.length > 0 ? (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 10,
            fontSize: 12,
            color: 'var(--color-muted)',
            lineHeight: 1.7,
          }}
        >
          <div className="flex justify-between gap-3">
            <span>Soma dos serviços preenchidos</span>
            <strong style={{ color: 'var(--color-ink)' }}>
              {totais.preenchido > 0 ? `R$ ${fmtBRL(totais.preenchido)}` : '—'}
            </strong>
          </div>
          {totais.semValor > 0 && totais.sugerido > 0 ? (
            <div className="flex justify-between gap-3">
              <span>
                Com a sugestão da tabela nos {totais.semValor === 1 ? 'que falta' : `${totais.semValor} que faltam`}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>R$ {fmtBRL(totais.sugerido)}</span>
            </div>
          ) : null}
          {totais.semSugestao > 0 ? (
            <div style={{ fontSize: 11 }}>
              {totais.semSugestao === 1
                ? '1 serviço sem valor e sem sugestão na tabela.'
                : `${totais.semSugestao} serviços sem valor e sem sugestão na tabela.`}
            </div>
          ) : null}
        </div>
      ) : null}

      {seletorAberto ? (
        <SeletorDeServicos
          onClose={() => setSeletorAberto(false)}
          onEscolher={adicionarDaTabela}
          alturaInicial={alturaDoAcesso(access)}
        />
      ) : null}
    </div>
  );
}

// ─── Linha ────────────────────────────────────────────────────────────────

function LinhaDeServico({
  servico: s,
  onChange,
  onRemove,
}: {
  servico: ServicoDoOrcamento;
  onChange: (patch: Partial<ServicoDoOrcamento>) => void;
  onRemove: () => void;
}) {
  const sub = subtotalDoServico(s);
  const sugerido = subtotalSugerido(s);
  const unid = unidadeCurta(s.unidade);
  const avulso = s.priceItemId === null;
  const sug = s.sugestao;

  return (
    <li
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '10px 12px',
        background: 'var(--color-white)',
      }}
    >
      <div className="flex items-start gap-2">
        <div style={{ flex: 1, minWidth: 0 }}>
          {avulso ? (
            <input
              type="text"
              value={s.servico}
              onChange={(e) => onChange({ servico: e.target.value })}
              placeholder="Nome do serviço (ex: grafite no muro)"
              aria-label="Nome do serviço avulso"
              className={inputCls}
            />
          ) : (
            <>
              <div
                className="font-bold"
                style={{ fontSize: 13, lineHeight: 1.35, color: 'var(--color-ink)', overflowWrap: 'anywhere' }}
              >
                {s.servico}
              </div>
              {s.detalhe ? (
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{s.detalhe}</div>
              ) : null}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${s.servico || 'serviço'}`}
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 'none',
            background: 'var(--color-cream)',
            color: 'var(--color-ink)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      <div className="flex items-end gap-2" style={{ marginTop: 8 }}>
        <label style={{ width: 96, flexShrink: 0 }}>
          <span className={rotuloCls}>Qtd ({unid})</span>
          <input
            type="text"
            inputMode="decimal"
            value={s.quantidade}
            onChange={(e) => onChange({ quantidade: e.target.value })}
            className={inputCls}
          />
        </label>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span className={rotuloCls}>Valor por {unid} (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={s.valorUnitario}
            onChange={(e) => onChange({ valorUnitario: e.target.value })}
            placeholder={s.sugestao ? `sugestão: ${fmtBRL(s.sugestao.medio)}` : 'ex: 25,00'}
            className={inputCls}
          />
        </label>
      </div>

      {sug ? (
        <div
          className="flex items-center justify-between gap-2"
          style={{ marginTop: 6, fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}
        >
          <span style={{ minWidth: 0 }}>
            Tabela ABRAPP: <b style={{ color: 'var(--color-ink)' }}>R$ {fmtBRL(sug.medio)}</b>/{unid}
            {sug.min !== null && sug.max !== null ? (
              <> · faixa R$ {fmtBRL(sug.min)} a R$ {fmtBRL(sug.max)}</>
            ) : null}
          </span>
          {!s.valorUnitario ? (
            <button
              type="button"
              onClick={() => onChange({ valorUnitario: fmtBRL(sug.medio) })}
              className="font-bold"
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--color-p1)',
                background: 'transparent',
                color: 'var(--color-p1)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Usar média
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className="flex justify-between gap-2"
        style={{ marginTop: 6, fontSize: 12, color: 'var(--color-muted)' }}
      >
        <span>Subtotal</span>
        {sub !== null ? (
          <strong style={{ color: 'var(--color-ink)' }}>R$ {fmtBRL(sub)}</strong>
        ) : sugerido !== null ? (
          <span>
            a definir <span style={{ opacity: 0.8 }}>(sugerido R$ {fmtBRL(sugerido)})</span>
          </span>
        ) : (
          <span>a definir</span>
        )}
      </div>
    </li>
  );
}

// ─── Seletor (modal) ──────────────────────────────────────────────────────

const ALTURAS: ReadonlyArray<{ valor: PriceAltura | null; rotulo: string }> = [
  { valor: null, rotulo: 'Qualquer altura' },
  { valor: 'ate_3m', rotulo: 'Até 3 m' },
  { valor: 'acima_3m', rotulo: 'Acima de 3 m' },
];

function SeletorDeServicos({
  onClose,
  onEscolher,
  alturaInicial,
}: {
  onClose: () => void;
  onEscolher: (item: PriceItem) => void;
  alturaInicial: PriceAltura | null;
}) {
  const { items, loading, error, vazio } = usePriceTable();
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [altura, setAltura] = useState<PriceAltura | null>(alturaInicial);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const categorias = useMemo(() => listarCategorias(items), [items]);
  const filtrados = useMemo(
    () => filtrarPrecos(items, { q: buscaAtiva, category: categoria, altura }),
    [items, buscaAtiva, categoria, altura],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escolher serviço da Tabela de Preços"
      className="fixed inset-0 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,.55)', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full"
        style={{
          maxWidth: 560,
          maxHeight: '88dvh',
          background: 'var(--color-bg)',
          borderRadius: '18px 18px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header
          className="flex items-center justify-between"
          style={{ padding: '14px 16px 8px', flexShrink: 0 }}
        >
          <div>
            <h3
              className="font-extrabold"
              style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)' }}
            >
              📊 Tabela de Preços
            </h3>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              ABRAPP 2026 · mão de obra · toque pra adicionar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: 'none',
              background: 'var(--color-white)',
              color: 'var(--color-ink)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar serviço, tinta, textura…"
            aria-label="Buscar na tabela de preços"
            className="w-full rounded-xl"
            style={{
              padding: '11px 14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-white)',
              color: 'var(--color-ink)',
              fontSize: 16, // 16px trava o zoom automático do iOS no foco
              marginBottom: 8,
            }}
          />
          <div className="flex gap-1.5" style={{ marginBottom: 8 }}>
            {ALTURAS.map((a) => (
              <Chip key={a.rotulo} ativo={altura === a.valor} onClick={() => setAltura(a.valor)} titulo={a.rotulo} />
            ))}
          </div>
          <div
            className="flex gap-1.5"
            style={{ marginBottom: 8, overflowX: 'auto', overscrollBehaviorX: 'contain', paddingBottom: 4 }}
          >
            <Chip ativo={categoria === null} onClick={() => setCategoria(null)} titulo="Todas" />
            {categorias.map((c) => (
              <Chip
                key={c}
                ativo={categoria === c}
                onClick={() => setCategoria(categoria === c ? null : c)}
                titulo={c}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 16px' }}>
          {loading ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--color-muted)' }}>
              Carregando a tabela…
            </p>
          ) : error ? (
            <Aviso>Não deu para carregar a tabela agora. Verifique a conexão e tente de novo.</Aviso>
          ) : vazio ? (
            <Aviso>A tabela ainda não foi carregada no banco. Use um serviço avulso por enquanto.</Aviso>
          ) : filtrados.length === 0 ? (
            <Aviso>Nada encontrado com esses filtros. Tente uma palavra mais curta.</Aviso>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8 }}>
                {filtrados.length === items.length
                  ? `${items.length} serviços`
                  : `${filtrados.length} de ${items.length} serviços`}
              </p>
              <ul className="flex flex-col gap-1.5">
                {filtrados.map((item) => (
                  <ItemDaTabela key={item.id} item={item} onClick={() => onEscolher(item)} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ItemDaTabela({ item, onClick }: { item: PriceItem; onClick: () => void }) {
  const semValor = semValorPublicado(item);
  const subtitulo = [item.grupo, item.tipo, rotuloAltura(item.altura)].filter(Boolean).join(' · ');
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-center gap-3"
        style={{
          padding: '10px 12px',
          background: 'var(--color-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            className="block font-bold"
            style={{ fontSize: 13, lineHeight: 1.35, color: 'var(--color-ink)', overflowWrap: 'anywhere' }}
          >
            {item.servico}
          </span>
          {subtitulo ? (
            <span className="block" style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
              {subtitulo}
            </span>
          ) : null}
        </span>
        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          {semValor ? (
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>sem valor</span>
          ) : (
            <>
              <span
                className="block font-extrabold"
                style={{ fontSize: 14, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}
              >
                R$ {fmtBRL(item.preco_medio)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>/{unidadeCurta(item.unidade)}</span>
            </>
          )}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--color-p1)', fontWeight: 800, flexShrink: 0 }}>
          +
        </span>
      </button>
    </li>
  );
}

function Chip({ ativo, onClick, titulo }: { ativo: boolean; onClick: () => void; titulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="rounded-full text-xs whitespace-nowrap"
      style={{
        padding: '6px 12px',
        border: `1px solid ${ativo ? 'transparent' : 'var(--color-border)'}`,
        background: ativo ? 'var(--color-p1)' : 'var(--color-white)',
        color: ativo ? '#fff' : 'var(--color-ink)',
        fontWeight: ativo ? 700 : 500,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {titulo}
    </button>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 14,
        fontSize: 13,
        lineHeight: 1.6,
        background: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-muted)',
      }}
    >
      {children}
    </div>
  );
}

const rotuloCls = 'block text-[10px] font-bold text-[color:var(--color-muted)] uppercase mb-1';
const inputCls =
  'w-full px-3 py-2 border border-[color:var(--color-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-p1)] bg-white';
