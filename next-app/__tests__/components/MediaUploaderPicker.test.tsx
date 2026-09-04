// @vitest-environment jsdom
//
// Regressão do aviso DUPLICADO (2026-08-30): o pintor mandou a foto da tela
// com a MESMA mensagem duas vezes, uma embaixo da outra. Causa: o clique
// programático no `<input type=file>` sobe (bubbling) até a div do dropzone,
// que tem onClick={handleSelect} — ou seja, um toque armava DOIS relógios e
// disparava o aviso duas vezes.
//
// Também trava o contrato novo: quando o seletor não abre, o app abre a
// saída com câmera/navegador em vez de um toast que some em 3s.
//
// E, desde 2026-09-01, o caso oposto: o seletor ABRE e o Android mata o app
// enquanto ele está na frente. Aí a tela renasce com uma escolha pendente no
// localStorage e tem que EXPLICAR isso — o pintor via o app voltar pro
// início sem foto e sem motivo (ver lib/utils/pickerRecovery.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MediaUploader } from '../../app/publicar/MediaUploader';
import { lerEscolhaPendente, marcarEscolhaPendente } from '@/lib/utils/pickerRecovery';

const naoAbriu = { fn: null as null | (() => void) };
const watchFilePicker = vi.fn((cb: () => void) => {
  naoAbriu.fn = cb;
  return () => {};
});

// Mock PARCIAL: `ehAndroid` tem que continuar o de verdade, porque é ele
// que decide se a marca de recuperação é gravada. Em jsdom o UA não é
// Android, então estes testes seguem cobrindo só o caminho do seletor.
vi.mock('@/lib/utils/filePickerWatch', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/utils/filePickerWatch')>();
  return {
    ...real,
    watchFilePicker: (cb: () => void) => watchFilePicker(cb),
    watchAppLeave: () => () => {},
  };
});
vi.mock('@/lib/utils/reportFailure', () => ({ reportFailure: vi.fn() }));
// Quem decide se o botão de câmera aparece é o hook (jsdom não tem
// `navigator.mediaDevices`, então o padrão é escondido).
const temBotaoCamera = { valor: false };
vi.mock('@/lib/hooks/useOfereceCamera', () => ({
  useOfereceCamera: () => temBotaoCamera.valor,
}));

beforeEach(() => {
  watchFilePicker.mockClear();
  naoAbriu.fn = null;
  temBotaoCamera.valor = false;
  localStorage.clear();
});
afterEach(cleanup);

describe('MediaUploader — seletor de arquivos', () => {
  it('um toque arma UM relógio só (o clique do input não pode rearmar)', () => {
    render(<MediaUploader onFiles={vi.fn()} />);
    fireEvent.click(screen.getByTestId('media-uploader'));
    expect(watchFilePicker).toHaveBeenCalledTimes(1);
  });

  it('quando a galeria não abre, mostra as SAÍDAS — não só um aviso', () => {
    render(<MediaUploader onFiles={vi.fn()} />);
    fireEvent.click(screen.getByTestId('media-uploader'));
    expect(screen.queryByText(/A galeria não abriu/)).toBeNull();
    act(() => {
      naoAbriu.fn?.();
    });
    expect(screen.getByText(/A galeria não abriu/)).toBeTruthy();
    expect(screen.getByText(/Tirar foto agora/)).toBeTruthy();
    expect(screen.getByText(/Abrir no navegador/)).toBeTruthy();
  });

  it('app morto com a galeria aberta: a tela renasce EXPLICANDO', () => {
    // O que o Android deixou pra trás quando matou o processo.
    marcarEscolhaPendente('/publicar', 'publicar');
    render(<MediaUploader onFiles={vi.fn()} />);
    expect(screen.getByText(/O app reiniciou no meio da escolha/)).toBeTruthy();
    // Sem culpar a galeria, que desta vez abriu — e com as duas saídas.
    expect(screen.queryByText(/A galeria não abriu/)).toBeNull();
    expect(screen.getByText(/Tirar foto agora/)).toBeTruthy();
    expect(screen.getByText(/Abrir no navegador/)).toBeTruthy();
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
    expect(screen.queryByText(/O app reiniciou no meio da escolha/)).toBeNull();
  });

  it('sem marca pendente, nada aparece no boot', () => {
    render(<MediaUploader onFiles={vi.fn()} />);
    expect(screen.queryByText(/O app reiniciou no meio da escolha/)).toBeNull();
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
    // Abrir a câmera não pode passar pelo seletor de arquivos.
    expect(watchFilePicker).not.toHaveBeenCalled();
  });
});
