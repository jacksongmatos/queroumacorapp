// NativePushBridge — a cola que faltava entre a permissão concedida e o push
// chegando de verdade. Montado no AppShell (toda tela privada), invisível.
//
// Faz três coisas que nada fazia:
//
//  1. GARANTE O TOKEN. Até 2026-09-04 o único lugar que gravava em
//     `push_device_tokens` era o botão "Ativar" do <NativePushOptIn> — e esse
//     botão SOME quando a permissão do SO já está concedida. Quem já tinha
//     permitido via o card dizendo "Ativadas neste aparelho" com a tabela
//     VAZIA, e o servidor mandava o push pra ninguém. Aqui o token é
//     garantido a cada abertura, sem prompt (só age com permissão já dada).
//
//  2. SEGUE A ROTAÇÃO DO TOKEN. O token do FCM muda (limpar dados do app,
//     reinstalar, renovação do Firebase). Sem escutar `tokenReceived`, a
//     linha no banco vira lixo apontando pra um device morto: o FCM responde
//     200 e a notificação não chega em lugar nenhum.
//
//  3. LIGA O TOQUE NA NOTIFICAÇÃO. `initNativePushTapRouting` existia e
//     nunca era montado — o toque abria SEMPRE a tela inicial, ignorando o
//     `data.url` que o servidor manda ('/chat' pra mensagem).
//
// Tudo feature-detected: fora da casca nativa é no-op completo.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { native } from '@/lib/native';
import { ensureDeviceToken, saveDeviceToken } from '@/lib/services/pushTokens';

export function NativePushBridge() {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !native.push.isAvailable()) return;

    // (1) Na abertura e (2) a cada volta do background: o token pode ter
    // rotacionado com o app fechado, e aí o evento não chega pra ninguém.
    void ensureDeviceToken(userId);
    const offResume = native.onResume(() => {
      void ensureDeviceToken(userId);
    });

    // (2) Rotação enquanto o app está aberto.
    const offToken = native.push.onTokenRefresh((token) => {
      void saveDeviceToken(userId, token);
    });

    // (3) Toque na notificação abre a tela certa.
    const offTap = native.push.initTapRouting((path) => {
      router.push(path);
    });

    return () => {
      offResume();
      offToken();
      offTap();
    };
  }, [userId, router]);

  return null;
}
