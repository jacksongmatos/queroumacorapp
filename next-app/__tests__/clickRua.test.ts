// Testes do catálogo da revista Click Rua. Além das funções puras, este
// arquivo confere que os ARQUIVOS das páginas existem em `public/` — o
// catálogo é escrito à mão, e uma edição que anuncia 8 páginas e tem 7 no
// disco só apareceria como página em branco no celular de alguém.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EDICOES,
  edicoesProntas,
  paginaUrl,
  paginasDe,
  rotuloEdicao,
} from '@/lib/clickRua';

function caminhoPublico(url: string): string {
  return fileURLToPath(new URL(`../public${url}`, import.meta.url));
}

describe('catálogo Click Rua', () => {
  it('tem a edição 1 pronta e as outras cinco como "em breve"', () => {
    expect(EDICOES).toHaveLength(6);
    expect(edicoesProntas()).toHaveLength(1);
    expect(edicoesProntas()[0]!.numero).toBe(1);
    expect(EDICOES.filter((e) => e.status === 'em_breve')).toHaveLength(5);
  });

  it('numera as edições em sequência, sem repetir', () => {
    expect(EDICOES.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('monta a URL da página a partir do slug', () => {
    const ed = edicoesProntas()[0]!;
    expect(paginaUrl(ed, 1)).toBe('/click-rua/ed01/1.webp');
    expect(paginasDe(ed)).toHaveLength(ed.paginas);
    expect(paginasDe(ed).at(-1)).toBe(`/click-rua/ed01/${ed.paginas}.webp`);
  });

  it('rotula com dois dígitos, como na capa', () => {
    expect(rotuloEdicao(1)).toBe('Edição #01');
    expect(rotuloEdicao(12)).toBe('Edição #12');
  });
});

describe('arquivos das edições', () => {
  it('toda página anunciada existe em public/', () => {
    for (const ed of edicoesProntas()) {
      for (const url of paginasDe(ed)) {
        expect(existsSync(caminhoPublico(url)), `faltando ${url}`).toBe(true);
      }
    }
  });

  it('toda edição pronta tem capa no disco', () => {
    for (const ed of edicoesProntas()) {
      expect(existsSync(caminhoPublico(ed.capa)), `faltando ${ed.capa}`).toBe(true);
    }
  });

  it('o logo usado no cabeçalho existe', () => {
    expect(existsSync(caminhoPublico('/click-rua/logo.webp'))).toBe(true);
  });
});
