'use client';
// SplashMascotes — a espera de boot com a turma da Cali Colors no lugar do
// "Carregando…" seco (pedido do usuário, 2026-09-02). Aparece na raiz (/)
// enquanto o auth decide o destino e no AppShell enquanto a sessão resolve —
// as duas telas que o app instalado mostra logo depois do splash do wrapper.
//
// Decisões:
//   - A arte é UMA imagem (/mascotes-calicolors.webp, 640w ≈ 40KB) — os 4
//     mascotes (Alice, Seu Zé, Senna, Fê) com o logo. Animar a imagem
//     inteira (flutuação suave) custa só CSS; nada de rede além do arquivo,
//     que o browser cacheia depois do primeiro boot.
//   - Primeira abertura da vida: a imagem pode chegar DEPOIS da tela. Por
//     isso os pontinhos de tinta + texto animam sozinhos desde o primeiro
//     frame — a tela nunca fica morta esperando a própria máscara.
//   - `prefers-reduced-motion`: tudo congela (só some a animação; a arte e
//     o texto ficam).
//   - Keyframes inline no componente (mesmo padrão do BottomSheet) — o
//     componente é autossuficiente, sem depender de bump no globals.css.

const CORES_TINTA = ['#2f6fd8', '#3fae4e', '#f07c22'];

export function SplashMascotes({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="splash-mascotes min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center">
      <img
        src="/mascotes-calicolors.webp"
        alt=""
        width={640}
        height={762}
        decoding="async"
        className="w-[62vw] max-w-[250px] h-auto rounded-2xl"
        style={{
          animation: 'splashFloat 3.2s ease-in-out infinite',
          boxShadow: '0 10px 30px rgba(26,26,46,.10)',
        }}
      />
      <div className="flex items-center gap-2" aria-hidden="true">
        {CORES_TINTA.map((cor, i) => (
          <span
            key={cor}
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{
              background: cor,
              animation: `splashPingo 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="text-[color:var(--color-muted)] text-sm">{texto}</div>
      <style>{`
        @keyframes splashFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes splashPingo {
          0%, 100% { transform: translateY(0); opacity: .55; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-mascotes img, .splash-mascotes span { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
