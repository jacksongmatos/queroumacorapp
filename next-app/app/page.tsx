'use client';
// HomePage — porta de entrada. Acesso sem conta foi REMOVIDO: logado vai pro
// /feed; deslogado vai pro /login. (Antes mandava todo mundo pro /feed em
// modo visitante.)

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { SplashMascotes } from '@/components/SplashMascotes';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/feed' : '/login');
  }, [loading, user, router]);

  // Splash com os mascotes enquanto auth resolve + redirect dispara —
  // mascara a espera com a marca em vez do "Carregando..." seco.
  return (
    <main>
      <SplashMascotes />
    </main>
  );
}
