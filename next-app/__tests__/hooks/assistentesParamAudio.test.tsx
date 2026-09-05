// @vitest-environment jsdom
//
// A voz dos assistentes (Seu Zé, Alice, Fê, Senna) tem que PARAR ao sair da
// tela deles.
//
// Relato de produção (2026-09-05): abrir o Seu Zé, conversar, fechar o modal
// — e ele continuava falando, sem nenhum botão na tela pra mandar calar.
//
// A raiz é sutil e vale entender antes de mexer: o elemento de áudio nasce de
// `new Audio()` e vive num ref. Ele NÃO está no DOM, então desmontar o
// componente não para reprodução nenhuma — o navegador segue tocando um
// objeto que ninguém mais enxerga. O `BottomSheet` desmonta os filhos ao
// fechar, então o áudio ficava órfão e audível.
//
// `stopSpeaking` já existia no hook; o que faltava era chamá-lo no unmount.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const ttsMock = vi.fn(async () => 'blob:fake-audio');

vi.mock('@/lib/services/aiChat', () => ({
  sendChatMessage: vi.fn(),
  transcribeAudio: vi.fn(),
  textToSpeech: (...a: unknown[]) => ttsMock(...(a as [])),
  trimHistory: (h: unknown) => h,
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, emailVerified: true }),
}));

vi.mock('@/lib/hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    isRecording: false,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    error: null,
  }),
}));

// Áudio falso que registra pause/play — é o que precisamos observar.
const pausados: number[] = [];
let criados = 0;

class AudioFalso {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private id: number;
  constructor(src: string) {
    this.src = src;
    this.id = ++criados;
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    pausados.push(this.id);
  }
}

beforeEach(() => {
  pausados.length = 0;
  criados = 0;
  vi.stubGlobal('Audio', AudioFalso as unknown as typeof Audio);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:fake-audio',
    revokeObjectURL: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// Os quatro hooks são clones com mudanças cirúrgicas (persona, rota). Se um
// ganhar a correção e os outros não, o bug volta pelos que ficaram — por
// isso o teste roda nos quatro.
const HOOKS = [
  ['Seu Zé', () => import('@/lib/hooks/useSeuZe').then((m) => m.useSeuZe)],
  ['Alice', () => import('@/lib/hooks/useAlice').then((m) => m.useAlice)],
  ['Fê', () => import('@/lib/hooks/useFe').then((m) => m.useFe)],
  ['Senna', () => import('@/lib/hooks/useSenna').then((m) => m.useSenna)],
] as const;

describe('voz dos assistentes para ao sair da tela', () => {
  for (const [nome, carregar] of HOOKS) {
    it(`${nome}: desmontar corta o áudio que está tocando`, async () => {
      const useHook = await carregar();
      const { result, unmount } = renderHook(() => useHook(), { wrapper });

      // `speakText` é o caminho mais direto pro mesmo elemento de áudio que
      // o botão "🔊 Ouvir" usa — ele toca sem precisar de mensagem na
      // thread, então o teste não depende de mockar o envio inteiro.
      await act(async () => {
        await (result.current as { speakText: (t: string) => Promise<void> })
          .speakText('bom dia');
      });

      // Sem isto o teste vira fumaça: se nenhum áudio nasceu, "foi pausado"
      // passa por vacuidade. Foi exatamente o que aconteceu na 1ª versão
      // deste arquivo — ela passava com a correção revertida.
      expect(criados).toBe(1);
      expect(pausados).toHaveLength(0);

      act(() => unmount());
      expect(pausados).toEqual([1]);
    });

    it(`${nome}: unmount não lança mesmo sem áudio tocando`, async () => {
      const useHook = await carregar();
      const { unmount } = renderHook(() => useHook(), { wrapper });
      expect(() => unmount()).not.toThrow();
      expect(pausados).toHaveLength(0);
    });

    it(`${nome}: app indo pro fundo também corta a fala`, async () => {
      const useHook = await carregar();
      const { result } = renderHook(() => useHook(), { wrapper });

      await act(async () => {
        await (result.current as { speakText: (t: string) => Promise<void> })
          .speakText('bom dia');
      });
      expect(criados).toBe(1);

      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(pausados).toEqual([1]);
    });
  }
});
