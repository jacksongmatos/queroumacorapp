// NativePushRouter — monta o roteamento de TOQUE na push nativa.
//
// Sem UI: só registra o listener `pushNotificationActionPerformed` (via
// lib/native) e, quando o usuário toca numa notificação, navega pro
// `data.url` que o servidor mandou (fcm.ts). Fora da casca / sem plugin é
// no-op. Montado uma vez no AppShell.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { native } from '@/lib/native';

export function NativePushRouter() {
  const router = useRouter();
  useEffect(() => {
    // initTapRouting devolve o cleanup; o path já vem validado (relativo).
    return native.push.initTapRouting((path) => router.push(path));
  }, [router]);
  return null;
}
