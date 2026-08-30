// @vitest-environment jsdom
// camera — as decisões que mandam a pessoa pro caminho certo quando a
// galeria não abre (app empacotado). Errar aqui é oferecer câmera onde não
// existe, ou esconder a única saída que sobrou.
import { describe, expect, it } from 'vitest';
import {
  erroDeCamera,
  nomeDaFoto,
  ofereceCamera,
  tamanhoDeSaida,
  temCamera,
} from '../../lib/utils/camera';

const COM_CAMERA = { mediaDevices: { getUserMedia: () => {} } };

describe('temCamera', () => {
  it('reconhece o ambiente que tem getUserMedia', () => {
    expect(temCamera(COM_CAMERA)).toBe(true);
  });
  it('diz não quando a API não existe (WebView antiga, http sem TLS)', () => {
    expect(temCamera({})).toBe(false);
    expect(temCamera({ mediaDevices: {} })).toBe(false);
    expect(temCamera(null)).toBe(false);
  });
});

describe('ofereceCamera', () => {
  it('mostra o botão no celular', () => {
    expect(ofereceCamera({ nav: COM_CAMERA, toque: true })).toBe(true);
  });
  it('esconde no desktop — lá o seletor de arquivos funciona', () => {
    expect(ofereceCamera({ nav: COM_CAMERA, toque: false })).toBe(false);
  });
  it('esconde quando não há câmera, mesmo em tela de toque', () => {
    expect(ofereceCamera({ nav: {}, toque: true })).toBe(false);
  });
});

describe('erroDeCamera', () => {
  it('permissão negada vira instrução de liberar nos ajustes', () => {
    const r = erroDeCamera({ name: 'NotAllowedError' });
    expect(r.tipo).toBe('negada');
    expect(r.msg).toMatch(/permissão/i);
  });
  it('câmera ocupada por outro app é dito com todas as letras', () => {
    expect(erroDeCamera({ name: 'NotReadableError' }).tipo).toBe('em-uso');
  });
  it('aparelho sem câmera', () => {
    expect(erroDeCamera({ name: 'NotFoundError' }).tipo).toBe('sem-camera');
  });
  it('câmera que nunca responde (WebView) é tratada como sem suporte', () => {
    const r = erroDeCamera({ name: 'TimeoutError' });
    expect(r.tipo).toBe('sem-suporte');
    expect(r.msg).toMatch(/navegador/i);
  });
  it('desconhecido nunca fica sem mensagem', () => {
    const r = erroDeCamera(new Error('vixe'));
    expect(r.tipo).toBe('erro');
    expect(r.msg.length).toBeGreaterThan(0);
  });
});

describe('tamanhoDeSaida', () => {
  it('encolhe a foto de celular mantendo a proporção', () => {
    expect(tamanhoDeSaida(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(tamanhoDeSaida(3000, 4000)).toEqual({ w: 1200, h: 1600 });
  });
  it('não estica quem já é pequeno', () => {
    expect(tamanhoDeSaida(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it('sem dimensão (vídeo ainda sem frame) cai num quadrado seguro', () => {
    expect(tamanhoDeSaida(0, 0)).toEqual({ w: 1600, h: 1600 });
  });
});

describe('nomeDaFoto', () => {
  it('gera .jpg — o bucket recusa arquivo sem tipo reconhecível', () => {
    expect(nomeDaFoto(1700000000000)).toBe('foto-1700000000000.jpg');
  });
});
