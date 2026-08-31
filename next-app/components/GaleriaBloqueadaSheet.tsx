// GaleriaBloqueadaSheet — o que aparece quando a galeria NÃO abriu.
//
// Motivo (2026-08-30): até aqui esse caso virava um toast vermelho
// ("abra pelo navegador") que some em 3 segundos e não faz nada. Dois
// pintores ficaram travados assim — um deles nem trocou a foto de perfil
// nem publicou portfólio. Toast não é saída; botão é.
//
// Duas saídas, na ordem em que resolvem:
//   1. 📷 Tirar foto agora — não passa pelo seletor de arquivos, então
//      não depende do `onShowFileChooser` que falta no wrapper.
//   2. 🌐 Abrir no navegador — garantido, mas exige entrar de novo no
//      Chrome; por isso é a segunda opção, não a primeira.
//
// A correção de raiz continua sendo no painel do WebIntoApp
// (`docs/ANDROID_BUILD.md`); isto é o que a pessoa tem HOJE, no aparelho
// que já está instalado.

'use client';

import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { CameraCapture } from './CameraCapture';
import { showToast } from '@/lib/toast';
import { abrirNoNavegador, copiarTexto } from '@/lib/utils/openInBrowser';

export interface GaleriaBloqueadaSheetProps {
  open: boolean;
  onClose: () => void;
  /** Recebe a foto tirada na hora — mesmo File que viria da galeria. */
  onFoto: (file: File) => void;
  facing?: 'user' | 'environment';
  /** Pra onde mandar quem escolher o navegador (URL completa). */
  urlNoNavegador: string;
  ctx?: string;
  userId?: string | null;
}

export function GaleriaBloqueadaSheet({
  open,
  onClose,
  onFoto,
  facing = 'environment',
  urlNoNavegador,
  ctx,
  userId,
}: GaleriaBloqueadaSheetProps) {
  const [camAberta, setCamAberta] = useState(false);

  async function irProNavegador() {
    abrirNoNavegador(urlNoNavegador, {
      onNaoAbriu: async () => {
        const ok = await copiarTexto(urlNoNavegador);
        showToast(
          ok
            ? 'Link copiado. Abra o Chrome e cole na barra de endereço.'
            : `Abra o Chrome e digite: ${urlNoNavegador}`,
          'info',
        );
      },
    });
  }

  return (
    <>
      <BottomSheet open={open && !camAberta} onClose={onClose} ariaLabel="A galeria não abriu">
        <div style={{ padding: '4px 4px 12px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>
            A galeria não abriu
          </div>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--color-muted)',
              marginBottom: 14,
            }}
          >
            Este aparelho não deixou o app abrir as fotos salvas. Não é a sua conta —
            e tem duas saídas agora:
          </p>

          <button
            type="button"
            onClick={() => setCamAberta(true)}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 14,
              background: 'var(--color-ink)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              textAlign: 'left',
            }}
          >
            📷 Tirar foto agora
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>
              Usa a câmera do celular — funciona aqui dentro do app.
            </div>
          </button>

          <button
            type="button"
            onClick={irProNavegador}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '14px 16px',
              borderRadius: 14,
              background: '#fff',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: 15,
              textAlign: 'left',
            }}
          >
            🌐 Abrir no navegador
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-muted)',
                marginTop: 2,
              }}
            >
              Pelo Chrome as fotos salvas abrem normalmente (vai pedir seu login lá).
            </div>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '10px 16px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--color-muted)',
            }}
          >
            Agora não
          </button>
        </div>
      </BottomSheet>

      <CameraCapture
        open={camAberta}
        facing={facing}
        onClose={() => setCamAberta(false)}
        onCapture={(f) => {
          setCamAberta(false);
          onClose();
          onFoto(f);
        }}
        ctx={ctx}
        userId={userId}
      />
    </>
  );
}
