// O caso real (2026-09-01): o "Files Chooser" do WebIntoApp devolve a foto
// com `type` VAZIO, e a validação `startsWith('image/')` recusava uma foto
// de verdade — "Selecione um arquivo de imagem" na cara de quem selecionou
// exatamente isso. Estes testes travam a regra: quando o Android não diz o
// tipo, quem decide é a extensão; e o upload tem que sair com o MIME certo,
// senão o `allowed_mime_types` do bucket recusa.

import { describe, it, expect } from 'vitest';
import {
  comMimeCorrigido,
  ehImagem,
  ehVideo,
  extensaoDe,
  mimeConfiavel,
} from '@/lib/utils/mediaType';

function arquivo(nome: string, tipo: string): File {
  return new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });
}

describe('mimeConfiavel', () => {
  it('confia no tipo quando ele é específico', () => {
    expect(mimeConfiavel(arquivo('x.jpg', 'image/png'))).toBe('image/png');
  });

  it('cai na extensão quando o Android não manda tipo', () => {
    expect(mimeConfiavel(arquivo('foto.jpg', ''))).toBe('image/jpeg');
    expect(mimeConfiavel(arquivo('FOTO.JPEG', ''))).toBe('image/jpeg');
    expect(mimeConfiavel(arquivo('parede.PNG', ''))).toBe('image/png');
  });

  it('trata octet-stream como "não sei", não como tipo', () => {
    expect(mimeConfiavel(arquivo('foto.jpg', 'application/octet-stream'))).toBe(
      'image/jpeg',
    );
  });

  it('devolve vazio quando nada identifica o arquivo', () => {
    expect(mimeConfiavel(arquivo('semextensao', ''))).toBe('');
    expect(mimeConfiavel(arquivo('doc.pdf', ''))).toBe('');
  });
});

describe('ehImagem / ehVideo', () => {
  it('aceita a foto que veio sem MIME do seletor do wrapper', () => {
    expect(ehImagem(arquivo('IMG_20260901_114900.jpg', ''))).toBe(true);
    expect(ehImagem(arquivo('captura.heic', ''))).toBe(true);
  });

  it('continua recusando o que não é imagem', () => {
    expect(ehImagem(arquivo('planilha.csv', 'text/csv'))).toBe(false);
    expect(ehImagem(arquivo('doc.pdf', 'application/pdf'))).toBe(false);
    expect(ehImagem(arquivo('qualquer', ''))).toBe(false);
  });

  it('separa vídeo de imagem mesmo sem MIME', () => {
    expect(ehVideo(arquivo('obra.mp4', ''))).toBe(true);
    expect(ehVideo(arquivo('obra.mov', ''))).toBe(true);
    expect(ehImagem(arquivo('obra.mp4', ''))).toBe(false);
  });

  it('nulo não é imagem nem vídeo', () => {
    expect(ehImagem(null)).toBe(false);
    expect(ehVideo(undefined)).toBe(false);
  });
});

describe('comMimeCorrigido', () => {
  it('corrige o tipo vazio — sem isso o bucket recusa o upload', () => {
    const corrigido = comMimeCorrigido(arquivo('foto.jpg', ''));
    expect(corrigido.type).toBe('image/jpeg');
    expect(corrigido.name).toBe('foto.jpg');
  });

  it('não mexe no arquivo que já tem tipo bom', () => {
    const orig = arquivo('foto.png', 'image/png');
    expect(comMimeCorrigido(orig)).toBe(orig);
  });

  it('não inventa tipo pro que não dá pra deduzir', () => {
    const orig = arquivo('semextensao', '');
    expect(comMimeCorrigido(orig)).toBe(orig);
  });
});

describe('extensaoDe', () => {
  it('normaliza e ignora nome sem ponto', () => {
    expect(extensaoDe('a/b/foto.JPG')).toBe('jpg');
    expect(extensaoDe('semponto')).toBe('');
    expect(extensaoDe(null)).toBe('');
  });
});
