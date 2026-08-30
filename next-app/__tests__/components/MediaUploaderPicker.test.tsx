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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MediaUploader } from '../../app/publicar/MediaUploader';

const naoAbriu = { fn: null as null | (() => void) };
const watchFilePicker = vi.fn((cb: () => void) => {
  naoAbriu.fn = cb;
  return () => {};
});

vi.mock('@/lib/utils/filePickerWatch', () => ({
  watchFilePicker: (cb: () => void) => watchFilePicker(cb),
  watchAppLeave: () => () => {},
}));
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

  it('no celular o atalho da câmera aparece ANTES de qualquer falha', () => {
    temBotaoCamera.valor = true;
    render(<MediaUploader onFiles={vi.fn()} />);
    fireEvent.click(screen.getByTestId('media-uploader-camera'));
    expect(screen.getByTestId('camera-capture')).toBeTruthy();
    // Abrir a câmera não pode passar pelo seletor de arquivos.
    expect(watchFilePicker).not.toHaveBeenCalled();
  });
});
