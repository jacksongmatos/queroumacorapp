// @vitest-environment jsdom
//
// Etiqueta de auto-resposta (2026-08-28): a bolha detecta o marcador
// "🤖 Resposta automática:" (contrato anti-loop do trigger Wave 39) e
// renderiza a etiqueta com o Seu Zé no lugar do texto cru. O conteúdo
// gravado no banco NÃO muda — só a apresentação.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageBubble } from '@/components/MessageBubble';
import type { Message } from '@/lib/services/chat';

function msg(content: string): Message {
  return {
    id: 'm1',
    conversationId: 'a_b',
    senderId: 'sender-1',
    receiverId: 'receiver-1',
    content,
    type: 'text',
    createdAt: '2026-08-28T12:00:00Z',
    status: 'sent',
  };
}

afterEach(cleanup);

describe('MessageBubble — etiqueta de auto-resposta', () => {
  it('troca o prefixo cru pela etiqueta com o Seu Zé', () => {
    render(
      <MessageBubble
        message={msg('🤖 Resposta automática:\nOlá! Vi sua mensagem. Retorno em breve!')}
        kind="other"
        senderName="Jackson"
        onRetry={() => {}}
      />,
    );
    // A etiqueta aparece…
    expect(screen.getByText('Resposta automática')).toBeTruthy();
    // …com a carinha do Seu Zé…
    const img = document.querySelector('img[src="/img/seu-ze.webp"]');
    expect(img).toBeTruthy();
    // …o template segue visível…
    expect(screen.getByText(/Vi sua mensagem/)).toBeTruthy();
    // …e o emoji/prefixo cru não vaza pro DOM.
    expect(document.body.textContent).not.toContain('🤖');
  });

  it('mensagem normal segue renderizando como texto plano', () => {
    render(
      <MessageBubble message={msg('Oi, tudo bem?')} kind="me" onRetry={() => {}} />,
    );
    expect(screen.getByText('Oi, tudo bem?')).toBeTruthy();
    expect(document.querySelector('img[src="/img/seu-ze.webp"]')).toBeNull();
    expect(screen.queryByText('Resposta automática')).toBeNull();
  });
});
