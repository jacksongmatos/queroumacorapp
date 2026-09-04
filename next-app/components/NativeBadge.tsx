// NativeBadge — mantém o número no ícone do app igual ao total de pendências
// (avisos + mensagens não lidas). Usa o plugin Badge quando presente; no-op no
// navegador/PWA e em launcher sem suporte. Montado no AppShell, renderiza null.

'use client';

import { useEffect } from 'react';
import { native } from '@/lib/native';
import { useUnreadNotificationCount } from '@/lib/hooks/useUnreadNotificationCount';
import { useUnreadMessageCount } from '@/lib/hooks/useUnreadMessageCount';

export function NativeBadge() {
  const notif = useUnreadNotificationCount();
  const msgs = useUnreadMessageCount();

  useEffect(() => {
    native.badge.set((notif || 0) + (msgs || 0));
  }, [notif, msgs]);

  return null;
}
