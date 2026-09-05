// @vitest-environment jsdom
//
// O caso que sobrou aqui: o seletor ABRE e o Android mata o app enquanto ele
// está na frente. A tela renasce com uma escolha pendente no localStorage e
// tem que EXPLICAR isso — o pintor via o app voltar pro início sem foto e sem
// motivo (ver lib/utils/pickerRecovery.ts).
//
// O que SAIU em 2026-09-05: os testes do aviso "A galeria não abriu". Aquele
// relógio nasceu pra WebView do wrapper antigo, que não implementava
// `onShowFileChooser`. A casca Capacitor implementa — o seletor abre — e o
// que restava era falso positivo: o aviso aparecia por cima da galeria
// aberta. A folha e o detector foram removidos junto.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MediaUploader } from '../../app/publicar/MediaUploader';
import { lerEscolhaPendente, marcarEscolhaPendente } from '@/lib/utils/pickerRecovery';

vi.mock('@/lib/utils/reportFailure', () => ({ reportFailure: vi.fn() }));
// Quem decide se o botão de câmera aparece é o hook (jsdom não tem
// `navigator.mediaDevices`, então o padrão é escondido).
const temBotaoCamera = { valor: false };
vi.mock('@/lib/hooks/useOfereceCamera', () => ({
  useOfereceCamera: () => temBotaoCamera.valor,
}));

beforeEach(() => {
  temBotaoCamera.valor = false;
  localStorage.clear();
});
afterEach(cleanup);

describe('MediaUploader — seletor de arquivos', () => {
  it('app morto com a galeria aberta: a tela renasce EXPLICANDO', () => {
    // O que o Android deixou pra trás quando matou o processo. Continua
    // real — mas agora é um aviso EM LINHA, dispensável, não um modal: não
    // há decisão a tomar, só escolher a foto de novo.
    marcarEscolhaPendente('/publicar', 'publicar');
    render(<MediaUploader onFiles={vi.fn()} />);
    expect(screen.getByText(/a galeria estava aberta e a foto se perdeu/i)).toBeTruthy();
    // E NUNCA a folha "A galeria não abriu", removida em 2026-09-05: ela
    // culpava a galeria, que hoje abre normalmente na casca Capacitor.
    expect(screen.queryByText(/A galeria não abriu/)).toBeNull();
  });

  // P7 (01/09/2026): a tela saindo com uma escolha em aberto deixava a marca
  // no localStorage E os ouvintes de visibilidade vivos. Na abertura
  // seguinte, dentro de 5 min, o app levava a pessoa pro /publicar dizendo
  // "o app reiniciou" sem que nada disso tivesse acontecido.
  it('sair da tela com o seletor aberto NÃO deixa marca pra trás', () => {
    const ua = navigator.userAgent;
    // A marca só é armada no Android — sem isto o teste não exercita nada.
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 16; SM-S911B) AppleWebKit/537.36',
      configurable: true,
    });
    try {
      const { unmount } = render(<MediaUploader onFiles={vi.fn()} />);
      fireEvent.click(screen.getByTestId('media-uploader'));
      expect(lerEscolhaPendente()).not.toBeNull(); // armou
      unmount();
      expect(lerEscolhaPendente()).toBeNull(); // e limpou ao sair
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    }
  });

  it('marca de OUTRA tela não vira aviso aqui', () => {
    marcarEscolhaPendente('/perfil/editar', 'perfil/editar');
    render(<MediaUploader onFiles={vi.fn()} />);
    expect(screen.queryByText(/a foto se perdeu/i)).toBeNull();
  });

  it('sem marca pendente, nada aparece no boot', () => {
    render(<MediaUploader onFiles={vi.fn()} />);
    expect(screen.queryByText(/a foto se perdeu/i)).toBeNull();
    expect(screen.queryByText(/A galeria não abriu/)).toBeNull();
  });

  it('no celular o atalho da câmera abre a captura (web quando não há nativa) sem passar pelo seletor', async () => {
    temBotaoCamera.valor = true;
    render(<MediaUploader onFiles={vi.fn()} />);
    fireEvent.click(screen.getByTestId('media-uploader-camera'));
    // O clique agora tenta a câmera NATIVA (@capacitor/camera) primeiro; no
    // teste não há casca, então retorna 'unavailable' e cai no CameraCapture
    // web. Como isso passa por um await, esperamos o modal aparecer.
    expect(await screen.findByTestId('camera-capture')).toBeTruthy();
    // Abrir a câmera não pode deixar marca de escolha pendente — ela não
    // passa pelo seletor, então o app não corre risco de morrer no meio.
    expect(lerEscolhaPendente()).toBeNull();
  });
});
