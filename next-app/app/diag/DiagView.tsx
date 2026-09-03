// DiagView — coleta e mostra o estado do navegador atual. Tudo client-side:
// não há chamada ao servidor (nem ao banco), então funciona mesmo com as
// envs de admin erradas — que é justamente o cenário em que precisamos dela.

'use client';

import { useEffect, useState } from 'react';
import { isAndroid, isAndroidWebView } from '@/lib/hooks/useAndroidWebViewScrollPin';

interface Row {
  k: string;
  v: string;
  /** Destaque: verde = como esperado, vermelho = provável causa de bug. */
  tone?: 'ok' | 'bad';
}

export function DiagView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const android = isAndroid(ua);
    const wv = isAndroidWebView(ua);
    const swCtl =
      'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : null;
    const standalone =
      typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;

    const out: Row[] = [
      { k: 'User-Agent', v: ua },
      { k: 'É Android?', v: android ? 'sim' : 'não', tone: android ? 'ok' : undefined },
      {
        k: 'Reconhecido como WebView (token wv)',
        v: wv ? 'sim' : 'não',
      },
      {
        // O pin do pull-to-refresh liga em QUALQUER Android — se o body
        // não estiver esticado, o script do <head> não rodou.
        k: 'Trava do pull-to-refresh ativa',
        v: android
          ? (document.body.style.minHeight || document.documentElement.style.minHeight || '(não aplicada)')
          : 'n/a (só Android)',
        tone: android
          ? ((document.body.style.minHeight || document.documentElement.style.minHeight) ? 'ok' : 'bad')
          : undefined,
      },
      {
        k: 'Posição do documento (scrollY)',
        v: String(Math.round(window.scrollY)),
        tone: android ? (window.scrollY >= 1 ? 'ok' : 'bad') : undefined,
      },
      {
        // Se o SW não controla a página, TODA a defesa do "500 ao retomar"
        // (retry + página Reconectando) está fora do ar neste aparelho.
        k: 'Service Worker controlando a página',
        v: swCtl === null ? 'não suportado' : swCtl ? 'sim' : 'NÃO',
        tone: swCtl ? 'ok' : 'bad',
      },
      { k: 'Modo PWA (tela inicial)', v: standalone ? 'sim' : 'não' },
      { k: 'Online', v: navigator.onLine ? 'sim' : 'não', tone: navigator.onLine ? 'ok' : 'bad' },
      { k: 'Janela (px)', v: `${window.innerWidth} × ${window.innerHeight}` },
      { k: 'Densidade de tela', v: String(window.devicePixelRatio || 1) },
      { k: 'Idioma', v: navigator.language || '—' },
      { k: 'Endereço', v: window.location.href },
    ];
    setRows(out);

    // Registra também no /api/log-error: assim, quando a env de admin for
    // corrigida, o histórico já está lá no /admin/errors. Best-effort.
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'diag-page',
          msg: `diag android=${android} wv=${wv} sw=${swCtl} scrollY=${Math.round(window.scrollY)} standalone=${standalone}`,
          ua,
          ctx: 'diag',
        }),
      }).catch(() => {});
    } catch {
      // silencioso
    }
  }, []);

  if (!rows) return <p className="text-sm text-[color:var(--color-muted)]">Lendo…</p>;

  const asText = rows.map((r) => `${r.k}: ${r.v}`).join('\n');

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // clipboard pode estar bloqueado no WebView — fallback textarea.
          const done = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          };
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(asText).then(done).catch(() => {
              legacyCopy(asText);
              done();
            });
          } else {
            legacyCopy(asText);
            done();
          }
        }}
        className="w-full text-white font-bold mb-4"
        style={{ padding: 12, borderRadius: 12, border: 'none', background: 'var(--color-p1)', fontSize: 14 }}
      >
        {copied ? '✅ Copiado!' : '📋 Copiar tudo'}
      </button>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.k}
            className="bg-white border rounded-xl p-3"
            style={{
              borderColor:
                r.tone === 'bad'
                  ? 'rgba(230,57,70,.45)'
                  : r.tone === 'ok'
                    ? 'rgba(22,163,74,.35)'
                    : 'var(--color-border)',
            }}
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-muted)]">
              {r.k}
            </div>
            <div
              className="text-[13px] font-mono break-all mt-0.5"
              style={{
                color:
                  r.tone === 'bad'
                    ? 'var(--color-danger)'
                    : r.tone === 'ok'
                      ? 'var(--color-success)'
                      : 'var(--color-ink)',
              }}
            >
              {r.v}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function legacyCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    // sem clipboard — o texto segue visível na tela pra copiar na mão.
  }
}
