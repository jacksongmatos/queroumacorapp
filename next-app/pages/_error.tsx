// pages/_error.tsx — o erro de servidor em TEMPO DE EXECUÇÃO.
//
// Este é o que faltava em 01/09/2026. Eu tinha criado só o `pages/500.tsx`,
// confirmado no build que ele era gerado com a tela nova ("Reconectando"
// está lá dentro de `.next/server/pages/500.html`) — e o aparelho seguia
// recebendo o "500 | Server Error" cru. O motivo: a 500 estática cobre um
// caminho, e o erro em runtime cai no `_error`, que continuava sendo o
// padrão do Next.
//
// Os dois agora renderizam a mesma tela, que tenta se recarregar sozinha.
//
// 404 continua indo pro `app/not-found.tsx` — só 5xx merece auto-retry;
// recarregar uma página que não existe repetiria o "não existe".

import { TelaReconectando } from '@/components/TelaReconectando';

interface ErrorProps {
  statusCode?: number;
}

function ErrorPage({ statusCode }: ErrorProps) {
  if (statusCode === 404) {
    return (
      <div
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fdfbf7',
          color: '#1a1a2e',
          font: '400 15px/1.6 system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 44, marginBottom: 12 }} aria-hidden="true">
            🧭
          </div>
          <h1 style={{ fontSize: 19, margin: '0 0 8px' }}>Página não encontrada</h1>
          <p style={{ margin: '0 0 20px', color: '#6b6b7b', maxWidth: 280 }}>
            O endereço não existe ou saiu do ar.
          </p>
          <a
            href="/feed"
            style={{
              display: 'inline-block',
              borderRadius: 10,
              background: '#ff6b35',
              color: '#fff',
              font: '700 15px system-ui',
              padding: '12px 26px',
              textDecoration: 'none',
            }}
          >
            Ir pro início
          </a>
        </div>
      </div>
    );
  }
  return <TelaReconectando />;
}

ErrorPage.getInitialProps = ({
  res,
  err,
}: {
  res?: { statusCode?: number };
  err?: { statusCode?: number };
}) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default ErrorPage;
