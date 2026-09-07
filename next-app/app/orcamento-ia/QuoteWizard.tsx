// QuoteWizard — gerador de orçamento guiado pela IA com TODOS os campos
// que um pintor precisa pra um projeto completo. Sections agrupadas pra
// UX não ficar overwhelming:
//
//  1. **Cliente** — nome e telefone.
//  2. **Serviços** — UM BLOCO POR SERVIÇO (um orçamento tem vários: sala +
//     fachada, por exemplo). Cada bloco tem o próprio espaço (tipo, área, pé
//     direito, cômodos, superfície, acesso), o próprio material (tinta, cor,
//     demãos, preparação) e os próprios itens da Tabela de Preços da ABRAPP
//     (o mesmo catálogo do tile) ou avulsos — quantidade + valor por unidade,
//     que NASCE VAZIO com a sugestão da tabela do lado. Lógica pura em
//     `lib/orcamentoServicos.ts`; UI em `ServicosDoOrcamento`.
//  3. **Logística** — cidade/endereço, prazo em dias, incluir material?,
//     incluir mão de obra?, garantia (% retoques) — únicos por orçamento.
//  4. **IA** — Sugerir escopo (escreve técnico) + Sugerir preço (R$)
//
// Tudo isso vira o `description` enviado pro /api/chat-ai (Seu Zé escopo) e
// /api/pricing-suggest. Quanto mais campos preenchidos, melhor a sugestão.
//
// Valor final: o que a pessoa digitou vence; sem digitar, vale a soma dos
// serviços preenchidos; sem nada disso, a sugestão da IA. A soma com a
// sugestão da tabela aparece como dica, nunca entra sozinha no campo.

'use client';

import { useRouter } from 'next/navigation';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/lib/hooks/useProfile';
import { canSeeProFeature } from '@/lib/policies';
import { usePolicyUser } from '@/lib/hooks/usePolicyUser';
import { saveQuote } from '@/lib/services/pipeline';
import { showToast } from '@/lib/toast';
import { abrirLinkExterno } from '@/lib/native';
import {
  suggestScope,
  suggestPrice,
  type SuggestPriceResult,
} from '@/lib/services/aiChat';
import {
  areaTotal,
  descreverServico,
  detalhesDoServico,
  novoServico,
  quantidadeDe,
  resumoDoServico,
  subtotalDoItem,
  temAvulsoSemNome,
  tituloDosServicos,
  totaisDoOrcamento,
  valorUnitarioDe,
  type ServicoDoOrcamento,
} from '@/lib/orcamentoServicos';
import { unidadeCurta } from '@/lib/services/priceTable';
import { fmtBRL, parseBRL } from '@/lib/utils';
import { ServicosDoOrcamento } from './ServicosDoOrcamento';

interface FormState {
  // Cliente
  clientName: string;
  clientPhone: string;
  // Serviços — cada um com espaço, material e itens da Tabela ABRAPP.
  // Gravados em quote_data.servicos; sempre há pelo menos um.
  servicos: ServicoDoOrcamento[];
  // Logística
  city: string;
  durationDays: string;
  includeMaterial: boolean;
  includeLabor: boolean;
  warranty: string; // ex.: 90 dias retoques
  // Preço
  price: string;
  // IA
  description: string;
  scope: string;
}

export function QuoteWizard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const policyUser = usePolicyUser();
  const [form, setForm] = useState<FormState>({
    clientName: '',
    clientPhone: '',
    servicos: [novoServico()],
    city: '',
    durationDays: '',
    includeMaterial: true,
    includeLabor: true,
    warranty: '90 dias para retoques',
    price: '',
    description: '',
    scope: '',
  });
  const [priceResult, setPriceResult] = useState<SuggestPriceResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);

  // Monta a descrição rica que vai pra IA — concatena todos os campos
  // preenchidos. Quanto mais info, mais preciso o escopo/preço.
  const richDescription = useMemo(() => {
    const lines = [
      `Orçamento: ${tituloDosServicos(form.servicos)}`,
      `Serviços (${form.servicos.length}):`,
      ...form.servicos.map((s, i) => `${i + 1}) ${descreverServico(s, { marcador: '-' })}`),
      form.city && `Cidade: ${form.city}`,
      form.durationDays && `Prazo: ${form.durationDays} dias`,
      `Inclui material: ${form.includeMaterial ? 'sim' : 'não (só mão de obra)'}`,
      `Inclui mão de obra: ${form.includeLabor ? 'sim' : 'não (só material)'}`,
      form.warranty && `Garantia: ${form.warranty}`,
      form.description && `Observações: ${form.description}`,
    ].filter(Boolean);
    return lines.join('\n');
  }, [form]);

  const scopeMutation = useMutation<string, Error, string>({
    mutationFn: (desc: string) => suggestScope(desc),
    onSuccess: (scope) => setForm((f) => ({ ...f, scope })),
  });

  const priceMutation = useMutation<SuggestPriceResult, Error, void>({
    mutationFn: () =>
      suggestPrice({
        service_type: tituloDosServicos(form.servicos),
        description: richDescription,
        area_m2: areaTotal(form.servicos) ?? undefined,
      }),
    onSuccess: (res) => setPriceResult(res),
  });

  // Somas dos itens de TODOS os serviços: `preenchido` (só o que a pessoa
  // digitou) e `sugerido` (média da tabela onde falta valor). A segunda é só dica.
  const totaisServicos = useMemo(() => totaisDoOrcamento(form.servicos), [form.servicos]);

  // M8 fix: useMemo precisa rodar ANTES dos early returns (rules-of-hooks).
  // Valor numérico atual — manual > soma dos serviços preenchidos > IA.
  // priceResult.price serve de pré-preencho quando o user clica "Sugerir preço".
  const effectivePrice = useMemo(() => {
    // parseBRL, não parseFloat: o botão "Usar" escreve "1.616,00" e o
    // teclado do Android oferece ponto — parseFloat leria 1.616 (regra P1).
    const manual = parseBRL(form.price);
    if (Number.isFinite(manual) && manual > 0) return manual;
    if (totaisServicos.preenchido > 0) return totaisServicos.preenchido;
    return priceResult?.price ?? 0;
  }, [form.price, totaisServicos.preenchido, priceResult]);

  if (authLoading) {
    return (
      <div
        className="bg-white rounded-2xl border border-[color:var(--color-border)] p-8 animate-pulse h-96"
        aria-hidden="true"
      />
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 px-4 rounded-2xl bg-white border border-[color:var(--color-border)]">
        <div className="text-5xl mb-3" aria-hidden="true">📝</div>
        <h2 className="font-semibold mb-2">Entre pra usar o orçamento IA</h2>
        <Link
          href="/login"
          className="inline-block px-5 py-2 bg-[color:var(--color-p1)] text-white rounded-xl font-semibold"
        >
          Entrar
        </Link>
      </div>
    );
  }

  if (!canSeeProFeature(policyUser)) {
    return (
      <div className="text-center py-12 px-4 rounded-2xl bg-white border border-[color:var(--color-border)]">
        <div className="text-5xl mb-3" aria-hidden="true">📝</div>
        <h2 className="font-bold mb-2 text-[color:var(--color-ink)]">
          Orçamento IA é PRO
        </h2>
        <p className="text-sm text-[color:var(--color-muted)] mb-4 max-w-md mx-auto">
          Gere escopo e preço guiado pelo Seu Zé.
        </p>
        <Link
          href="/pro"
          className="inline-block px-5 py-2 bg-[color:var(--color-p1)] text-white rounded-xl font-semibold"
        >
          Ativar PRO
        </Link>
      </div>
    );
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSuggestScope() {
    scopeMutation.mutate(richDescription);
  }

  // Profile do pintor pro cabeçalho do PDF/preview.
  type ProfileLite = {
    name?: string | null; tag?: string | null;
    phone?: string | null; city?: string | null; state?: string | null;
    business_logo_url?: string | null; avatar_url?: string | null;
  };
  const p = (profile ?? {}) as ProfileLite;
  const painter = {
    name: p.name || (p.tag ? '@' + p.tag : 'Pintor'),
    phone: p.phone || '',
    city: p.city || '',
    state: p.state || '',
    logo: p.business_logo_url || p.avatar_url || '',
  };

  async function handleSave(): Promise<string | null> {
    if (saving) return savedQuoteId;
    if (effectivePrice <= 0) {
      showToast('Informe um valor pro orçamento', 'error');
      return null;
    }
    // Linha avulsa sem nome gravaria um item mudo no PDF; melhor avisar do
    // que descartar em silêncio o que a pessoa pode ter precificado.
    if (temAvulsoSemNome(form.servicos)) {
      showToast('Dê um nome ao item avulso antes de gravar', 'error');
      return null;
    }
    setSaving(true);
    try {
      const titulo = tituloDosServicos(form.servicos);
      const { quoteId } = await saveQuote({
        client_name: form.clientName || 'Cliente',
        service_type: titulo,
        title: titulo,
        area_m2: areaTotal(form.servicos),
        price: effectivePrice,
        quote_data: {
          ...form,
          painter,
          scope: form.scope,
          rich: richDescription,
          price_suggestion: priceResult,
        },
      });
      setSavedQuoteId(quoteId);
      showToast('Orçamento salvo no pipeline ✅', 'success');
      return quoteId;
    } catch (e) {
      showToast((e as Error).message || 'Erro ao gravar', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Texto plano do orçamento — usado pra WhatsApp/email.
  function buildPlainText(): string {
    const lines = [
      `*Orçamento — ${painter.name}*`,
      painter.phone ? `📞 ${painter.phone}` : null,
      painter.city ? `📍 ${painter.city}${painter.state ? '/' + painter.state : ''}` : null,
      '',
      form.clientName ? `Cliente: ${form.clientName}` : null,
      form.clientPhone ? `Telefone: ${form.clientPhone}` : null,
      '',
      form.servicos.length === 1 ? '*Serviço:*' : '*Serviços:*',
      ...form.servicos.map((s, i) =>
        (form.servicos.length > 1 ? `${i + 1}) ` : '') + descreverServico(s),
      ),
      '',
      form.durationDays ? `Prazo: ${form.durationDays} dias` : null,
      `Inclui material: ${form.includeMaterial ? 'sim' : 'não'} · Inclui mão de obra: ${form.includeLabor ? 'sim' : 'não'}`,
      form.warranty ? `Garantia: ${form.warranty}` : null,
      '',
      form.scope ? '*Escopo:*\n' + form.scope : null,
      '',
      effectivePrice > 0 ? `💰 *Valor: R$ ${effectivePrice.toLocaleString('pt-BR')}*` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  function handleSendWhatsApp() {
    const text = encodeURIComponent(buildPlainText());
    const phoneDigits = (form.clientPhone || '').replace(/\D/g, '');
    const url = phoneDigits
      ? `https://wa.me/55${phoneDigits}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleSendEmail() {
    const subj = encodeURIComponent(`Orçamento — ${tituloDosServicos(form.servicos)}`);
    const body = encodeURIComponent(buildPlainText());
    // `location.href` na casca vira a tela "Sem conexão" (ver abrirLinkExterno).
    abrirLinkExterno(`mailto:?subject=${subj}&body=${body}`);
  }

  // Enviar pelo chat interno do QueroUmaCor. Se o orçamento já foi gravado
  // (savedQuoteId), referenciamos o id na mensagem; se não, salva primeiro.
  // Sem clientPhone resolvível em userId aqui — UI redireciona pra /chat
  // com o texto pre-populado, user escolhe a conversa.
  async function handleSendChat() {
    // Garante que tem o quote salvo (pra que o cliente possa abrir o link).
    let qid = savedQuoteId;
    if (!qid) {
      qid = await handleSave();
      if (!qid) return; // erro já mostrou toast
    }
    const text = buildPlainText() + (qid ? `\n\nOrçamento #${qid.slice(0, 8)}` : '');
    try {
      sessionStorage.setItem('chat:prefill', text);
    } catch {
      /* ignore */
    }
    // Navegação de documento na casca = chance de "Sem conexão" (a errorPath
    // do Capacitor aparece quando a navegação falha ou é cancelada). O router
    // troca de tela sem recarregar o app; o prefill vive no sessionStorage,
    // que sobrevive igual.
    router.push('/chat');
  }

  // PDF: usa window.print() escopado por @media print. O preview já tem
  // .quote-pdf-content que vira a página A4 quando o user clica "Imprimir
  // / Salvar PDF". Sem jspdf — economiza ~150kb no bundle.
  function handlePrintPdf() {
    setPreviewOpen(true);
    // Espera um tick pra preview montar antes de abrir o diálogo de print.
    setTimeout(() => {
      window.print();
    }, 400);
  }

  // Compartilhar via Web Share API nativa do device (WhatsApp, Telegram,
  // Mensagens, etc). Fallback: copia texto pro clipboard.
  async function handleShareNative() {
    const text = buildPlainText();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Orçamento — ${tituloDosServicos(form.servicos)}`,
          text,
        });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Orçamento copiado!', 'success');
      } catch {
        showToast('Erro ao copiar', 'error');
      }
    }
  }

  return (
    <section className="space-y-4 quote-wizard-root">
      {/* ── 0. CLIENTE ── */}
      <Card title="👤 Cliente">
        <Row label="Nome do cliente">
          <input
            type="text"
            value={form.clientName}
            onChange={(e) => update('clientName', e.target.value)}
            placeholder="ex: Maria Silva"
            className={inputCls}
          />
        </Row>
        <Row label="Telefone / WhatsApp">
          <input
            type="tel"
            value={form.clientPhone}
            onChange={(e) => update('clientPhone', e.target.value)}
            placeholder="(11) 99999-9999"
            className={inputCls}
          />
        </Row>
      </Card>

      {/* ── 1. SERVIÇOS — um bloco por serviço (espaço + material + itens
          da Tabela ABRAPP). Logística e valor final seguem únicos. ── */}
      <Card title="🧾 Serviços">
        <ServicosDoOrcamento
          servicos={form.servicos}
          onChange={(next) => update('servicos', next)}
        />
      </Card>

      {/* ── 3. LOGÍSTICA ── */}
      <Card title="📋 Logística e comercial">
        <Row label="Cidade do serviço">
          <input
            type="text"
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
            placeholder="ex: São Paulo, SP"
            className={inputCls}
          />
        </Row>

        <Row label="Prazo estimado (dias úteis)">
          <input
            type="number"
            min={0}
            value={form.durationDays}
            onChange={(e) => update('durationDays', e.target.value)}
            placeholder="ex: 5"
            className={inputCls}
          />
        </Row>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-[color:var(--color-ink)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.includeLabor}
              onChange={(e) => update('includeLabor', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--color-p1)' }}
            />
            Inclui mão de obra
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--color-ink)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.includeMaterial}
              onChange={(e) => update('includeMaterial', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--color-p1)' }}
            />
            Inclui material (tinta + insumos)
          </label>
        </div>

        <Row label="Garantia">
          <input
            type="text"
            value={form.warranty}
            onChange={(e) => update('warranty', e.target.value)}
            placeholder="ex: 90 dias para retoques"
            className={inputCls}
          />
        </Row>
      </Card>

      {/* ── 4. DESCRIÇÃO E ESCOPO ── */}
      <Card title="✍️ Observações livres">
        <Row label="Descrição (opcional)">
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="ex: parede com mofo no quarto principal, urgência pra entregar dia 15"
            rows={3}
            className={inputCls}
          />
        </Row>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-[color:var(--color-muted)] uppercase">
              Escopo técnico do serviço
            </label>
            <button
              type="button"
              onClick={handleSuggestScope}
              disabled={scopeMutation.isPending}
              className="text-xs font-bold text-[color:var(--color-p1)] hover:opacity-80 disabled:opacity-50"
            >
              {scopeMutation.isPending ? '✨ Gerando…' : '✨ Sugerir escopo (IA)'}
            </button>
          </div>
          <textarea
            value={form.scope}
            onChange={(e) => update('scope', e.target.value)}
            placeholder="Cole o escopo aqui ou clique em 'Sugerir escopo (IA)' — o Seu Zé monta a partir dos campos acima"
            rows={7}
            className={inputCls}
          />
          {scopeMutation.error ? (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {scopeMutation.error.message}
            </p>
          ) : null}
        </div>
      </Card>

      {/* ── 5. AÇÃO: SUGERIR PREÇO ── */}
      <div>
        <button
          type="button"
          onClick={() => priceMutation.mutate()}
          disabled={priceMutation.isPending}
          className="w-full text-white font-bold"
          style={{
            padding: 14,
            background: 'var(--color-ink)',
            borderRadius: 14,
            fontSize: 15,
            border: 'none',
            cursor: priceMutation.isPending ? 'wait' : 'pointer',
            opacity: priceMutation.isPending ? 0.7 : 1,
          }}
        >
          {priceMutation.isPending ? 'Calculando…' : '💰 Sugerir preço (IA)'}
        </button>
        {priceMutation.error ? (
          <p role="alert" className="mt-2 text-xs text-red-700 text-center">
            {priceMutation.error.message}
          </p>
        ) : null}
      </div>

      {priceResult ? (
        <article
          className="rounded-2xl p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(255,107,53,.08), rgba(131,56,236,.08))',
            border: '1.5px solid var(--color-border)',
          }}
        >
          <h3 className="text-xs font-bold text-[color:var(--color-muted)] uppercase mb-2">
            Sugestão do Seu Zé
          </h3>
          <p
            className="text-3xl font-extrabold text-[color:var(--color-p1)] mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            R$ {priceResult.price.toLocaleString('pt-BR')}
          </p>
          {priceResult.justification ? (
            <p className="text-xs text-[color:var(--color-muted)]" style={{ lineHeight: 1.6 }}>
              {priceResult.justification}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => update('price', String(priceResult.price))}
            className="text-xs font-bold text-[color:var(--color-p1)] mt-2"
          >
            Usar este valor →
          </button>
        </article>
      ) : null}

      {/* ── 6. VALOR FINAL ── */}
      <Card title="💰 Valor final">
        <Row label="Valor do orçamento (R$)">
          <input
            type="text"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => update('price', e.target.value)}
            placeholder={
              totaisServicos.preenchido > 0
                ? `soma dos serviços: ${fmtBRL(totaisServicos.preenchido)}`
                : 'ex: 2500'
            }
            className={inputCls}
          />
        </Row>
        {form.servicos.length > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.7 }}>
            {totaisServicos.preenchido > 0 ? (
              <div className="flex items-center justify-between gap-2">
                <span>
                  Soma dos itens preenchidos:{' '}
                  <b style={{ color: 'var(--color-ink)' }}>R$ {fmtBRL(totaisServicos.preenchido)}</b>
                  {!form.price ? ' (vale se você não digitar outro)' : ''}
                </span>
                {form.price ? (
                  <BotaoUsar onClick={() => update('price', fmtBRL(totaisServicos.preenchido))} />
                ) : null}
              </div>
            ) : null}
            {totaisServicos.semValor > 0 && totaisServicos.sugerido > 0 ? (
              <div className="flex items-center justify-between gap-2">
                <span>
                  Sugestão pela Tabela ABRAPP: <b>R$ {fmtBRL(totaisServicos.sugerido)}</b>
                  {totaisServicos.semSugestao > 0 ? ' (parcial)' : ''}
                </span>
                <BotaoUsar onClick={() => update('price', fmtBRL(totaisServicos.sugerido))} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* ── 7. AÇÕES ── */}
      <div
        className="grid grid-cols-2 gap-2"
        style={{ marginTop: 6 }}
      >
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="font-bold"
          style={{
            padding: 12,
            background: '#fff',
            color: 'var(--color-ink)',
            borderRadius: 12,
            fontSize: 13,
            border: '1.5px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          👁️ Visualizar
        </button>
        <button
          type="button"
          onClick={handlePrintPdf}
          className="font-bold"
          style={{
            padding: 12,
            background: '#fff',
            color: 'var(--color-ink)',
            borderRadius: 12,
            fontSize: 13,
            border: '1.5px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          🖨️ PDF
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="font-bold text-white"
          style={{
            padding: 12,
            background: 'var(--color-ink)',
            borderRadius: 12,
            fontSize: 13,
            border: 'none',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Gravando…' : '💾 Gravar'}
        </button>
        <button
          type="button"
          onClick={handleSendChat}
          className="font-bold text-white text-center"
          style={{
            padding: 12,
            background: 'linear-gradient(135deg, var(--color-p1), var(--color-p4))',
            borderRadius: 12,
            fontSize: 13,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          📤 Enviar para a loja
        </button>
        {/* Compartilhar com o cliente (WhatsApp / E-mail / nativo) — full width */}
        <div className="relative col-span-2">
          <details className="w-full">
            <summary
              className="font-bold text-center list-none"
              style={{
                padding: 12,
                background: '#fff',
                color: 'var(--color-ink)',
                borderRadius: 12,
                fontSize: 13,
                border: '1.5px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              💬 Compartilhar com o cliente
            </summary>
            <div
              className="absolute left-0 right-0 z-10 bg-white"
              style={{
                top: 'calc(100% + 6px)',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                padding: 6,
              }}
            >
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-[color:var(--color-bg)]"
                style={{ cursor: 'pointer', background: 'none', border: 'none' }}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                className="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-[color:var(--color-bg)]"
                style={{ cursor: 'pointer', background: 'none', border: 'none' }}
              >
                ✉️ E-mail
              </button>
              <button
                type="button"
                onClick={handleShareNative}
                className="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-[color:var(--color-bg)]"
                style={{ cursor: 'pointer', background: 'none', border: 'none' }}
              >
                📲 Compartilhar (outros apps)
              </button>
            </div>
          </details>
        </div>
      </div>

      {savedQuoteId ? (
        <div
          className="text-center"
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            background: 'var(--color-cream)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="text-sm font-extrabold" style={{ color: 'var(--color-ink)' }}>
            ✅ Orçamento gravado!
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Ele fica em <b>Orçamentos → coluna “A orçar”</b> (não em “Meus Pedidos”,
            que é das compras na loja).
          </p>
          <Link
            href="/orcamentos"
            className="inline-block mt-2.5 font-bold text-white"
            style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--color-p1)', fontSize: 13 }}
          >
            👉 Ver no pipeline
          </Link>
        </div>
      ) : null}

      {previewOpen ? (
        <QuotePreviewModal
          onClose={() => setPreviewOpen(false)}
          painter={painter}
          form={form}
          price={effectivePrice}
        />
      ) : null}
    </section>
  );
}

// ─── Preview modal (full screen — também usado pelo print → PDF) ────────────

interface PreviewProps {
  onClose: () => void;
  painter: { name: string; phone: string; city: string; state: string; logo: string };
  form: FormState;
  price: number;
}

function QuotePreviewModal({ onClose, painter, form, price }: PreviewProps) {
  const today = new Date().toLocaleDateString('pt-BR');
  const content = (
    <>
      {/* Print styles: mostra só .quote-pdf-content e neutraliza os ancestrais
          que clipavam/posicionavam (overlay fixo + card com max-height/overflow).
          BUG corrigido: antes o overlay tinha .quote-pdf-noprint (display:none),
          o que apagava a subárvore inteira — incluindo o conteúdo — e o PDF saía
          em branco. visibility:visible num filho NÃO volta de um display:none
          no ancestral. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .quote-pdf-content, .quote-pdf-content * { visibility: visible !important; }
          html, body { background: #fff !important; overflow: visible !important; height: auto !important; }
          .quote-pdf-overlay, .quote-pdf-card {
            position: static !important;
            inset: auto !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .quote-pdf-content {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 16px !important;
            background: #fff !important;
            color: #000 !important;
          }
          .quote-pdf-noprint { display: none !important; }
        }
      `}</style>

      <div
        className="fixed inset-0 flex items-center justify-center quote-pdf-overlay"
        style={{ background: 'rgba(0,0,0,.55)', padding: 12, zIndex: 1100 }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white quote-pdf-card"
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '90vh',
            overflowY: 'auto',
            borderRadius: 16,
          }}
        >
          <header
            className="flex items-center justify-between quote-pdf-noprint"
            style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}
          >
            <h2 className="font-bold text-sm">Preview do orçamento</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
            >
              ✕
            </button>
          </header>

          <article className="quote-pdf-content" style={{ padding: 20 }}>
            {/* Cabeçalho com logo do pintor */}
            <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: '2px solid #222' }}>
              {painter.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={painter.logo}
                  alt="Logo"
                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                />
              ) : null}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#222' }}>{painter.name}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {painter.phone ? `📞 ${painter.phone}` : ''}
                  {painter.city ? `  📍 ${painter.city}${painter.state ? '/' + painter.state : ''}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 10, color: '#666' }}>
                <div>ORÇAMENTO</div>
                <div style={{ marginTop: 2 }}>{today}</div>
              </div>
            </header>

            {/* Cliente */}
            {(form.clientName || form.clientPhone) && (
              <section style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  Cliente
                </h3>
                <p style={{ fontSize: 13, color: '#222' }}>
                  {form.clientName ? <strong>{form.clientName}</strong> : null}
                  {form.clientPhone ? <span> · {form.clientPhone}</span> : null}
                </p>
              </section>
            )}

            {/* Serviços — um bloco por serviço */}
            {form.servicos.map((s, i) => {
              const detalhes = detalhesDoServico(s).filter(([k]) => k !== 'Área' && k !== 'Cômodos');
              return (
                <section key={s.id} style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                    {form.servicos.length > 1 ? `Serviço ${i + 1}` : 'Serviço'}
                  </h3>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#222', margin: '0 0 6px' }}>
                    {resumoDoServico(s)}
                  </p>
                  <table style={{ width: '100%', fontSize: 12, color: '#222', borderCollapse: 'collapse' }}>
                    <tbody>
                      {detalhes.map(([k, v]) => <Cell key={k} k={k} v={v} />)}
                    </tbody>
                  </table>
                  {s.itens.length > 0 ? (
                    <table style={{ width: '100%', fontSize: 12, color: '#222', borderCollapse: 'collapse', marginTop: 6 }}>
                      <tbody>
                        {s.itens.map((it) => {
                          const v = valorUnitarioDe(it);
                          const sub = subtotalDoItem(it);
                          return (
                            <tr key={it.id} style={{ borderTop: '1px solid #eee' }}>
                              <td style={{ padding: '5px 8px 5px 0', verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 600 }}>{it.servico || 'Item'}</div>
                                <div style={{ fontSize: 11, color: '#666' }}>
                                  {quantidadeDe(it)} {unidadeCurta(it.unidade)}
                                  {v !== null ? ` × R$ ${fmtBRL(v)}` : ''}
                                </div>
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, verticalAlign: 'top' }}>
                                {sub !== null ? `R$ ${fmtBRL(sub)}` : 'a definir'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : null}
                </section>
              );
            })}

            {/* Logística */}
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                Condições
              </h3>
              <table style={{ width: '100%', fontSize: 12, color: '#222', borderCollapse: 'collapse' }}>
                <tbody>
                  {form.city ? <Cell k="Cidade" v={form.city} /> : null}
                  {form.durationDays ? <Cell k="Prazo" v={`${form.durationDays} dias úteis`} /> : null}
                  <Cell k="Inclui material" v={form.includeMaterial ? 'sim' : 'não'} />
                  <Cell k="Inclui mão de obra" v={form.includeLabor ? 'sim' : 'não'} />
                  {form.warranty ? <Cell k="Garantia" v={form.warranty} /> : null}
                </tbody>
              </table>
            </section>

            {/* Escopo */}
            {form.scope ? (
              <section style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  Escopo técnico
                </h3>
                <p style={{ fontSize: 12, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {form.scope}
                </p>
              </section>
            ) : null}

            {/* Observações */}
            {form.description ? (
              <section style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  Observações
                </h3>
                <p style={{ fontSize: 12, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {form.description}
                </p>
              </section>
            ) : null}

            {/* Valor total */}
            <section
              style={{
                marginTop: 18,
                padding: 16,
                background: '#FFF4ED',
                borderRadius: 10,
                border: '2px solid #FF6B35',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: 10, color: '#999', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                Valor total
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#FF6B35' }}>
                R$ {price > 0 ? price.toLocaleString('pt-BR') : '—'}
              </div>
            </section>

            <p style={{ marginTop: 18, fontSize: 9, color: '#999', textAlign: 'center' }}>
              Orçamento gerado por QueroUmaCor · {today}
            </p>
          </article>

          <footer
            className="quote-pdf-noprint flex gap-2"
            style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 font-bold text-sm"
              style={{
                padding: 10,
                background: '#fff',
                color: 'var(--color-ink)',
                borderRadius: 10,
                border: '1.5px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 font-bold text-white text-sm"
              style={{
                padding: 10,
                background: 'var(--color-ink)',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🖨️ Imprimir / Salvar PDF
            </button>
          </footer>
        </div>
      </div>
    </>
  );
  // Portaliza pro body: o QuoteWizard abre dentro de um BottomSheet (transform
  // + overflow + max-height) que cortava o conteúdo no print → PDF em branco.
  // No body, os ancestrais que clipam somem e o print enxerga o conteúdo.
  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 8px 4px 0', color: '#666', verticalAlign: 'top', width: '40%' }}>{k}</td>
      <td style={{ padding: '4px 0', color: '#222', fontWeight: 600 }}>{v}</td>
    </tr>
  );
}

// ─── Atoms locais — Card / Row pra deixar o JSX legível ────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-white space-y-3"
      style={{
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--color-border)',
      }}
    >
      <h3
        className="font-extrabold"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          color: 'var(--color-ink)',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function BotaoUsar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      Usar
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-[color:var(--color-muted)] uppercase mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-[color:var(--color-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-p1)] bg-white';
