// isVideoPost — a mídia deste post é vídeo?
//
// Nasceu de um bug visível na tela "Em alta" (2026-09-05): metade das
// miniaturas aparecia como ícone de imagem quebrada, e uma delas exibia a
// legenda do post como texto — o `alt` de um `<img>` que não carregou. Causa:
// post de VÍDEO renderizado dentro de `<img>`.
//
// A regra estava escrita em QUATRO lugares de TRÊS jeitos diferentes:
//   - PostMedia: extensão OU media_type  (certo)
//   - StoryViewer: só extensão
//   - PortfolioSection: só media_type
//   - TrendingGrid / HashtagFeed: nenhum dos dois
// Regra duplicada é regra que diverge. Agora é uma função só, testada aqui.

import { describe, it, expect } from 'vitest';
import { isVideoPost } from '@/lib/utils';

describe('isVideoPost', () => {
  it('reconhece vídeo pela extensão da URL', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'm4v', 'ogv']) {
      expect(isVideoPost(`https://x.supabase.co/a/b.${ext}`, null)).toBe(true);
    }
  });

  it('reconhece vídeo pelo media_type quando a URL não tem extensão', () => {
    // Upload legado: o path é um id puro, sem extensão nenhuma.
    expect(isVideoPost('https://x.supabase.co/uid/9f3c1a2b', 'video')).toBe(true);
  });

  // O caso que os dois grids erravam: `media_type` marca que o post é STORY,
  // não que a mídia é vídeo. Quem confia só nesse campo põe vídeo em <img>.
  it('vídeo de story é vídeo, mesmo com media_type = "story"', () => {
    expect(isVideoPost('https://x.supabase.co/uid/clipe.mp4', 'story')).toBe(true);
  });

  it('vídeo com media_type nulo ainda é vídeo', () => {
    expect(isVideoPost('https://x.supabase.co/uid/clipe.mp4', null)).toBe(true);
  });

  it('foto não é vídeo', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'heic']) {
      expect(isVideoPost(`https://x.supabase.co/a/b.${ext}`, null)).toBe(false);
    }
    expect(isVideoPost('https://x.supabase.co/a/b.jpg', 'story')).toBe(false);
  });

  it('sem URL nunca é vídeo — nem com media_type dizendo que é', () => {
    // Post sem mídia cai no placeholder, não num <video src="null">.
    expect(isVideoPost(null, 'video')).toBe(false);
    expect(isVideoPost(undefined, 'video')).toBe(false);
    expect(isVideoPost('', 'video')).toBe(false);
  });

  it('extensão só conta no fim da URL ou antes de ?/#', () => {
    expect(isVideoPost('https://x.co/a/b.mp4?token=abc', null)).toBe(true);
    expect(isVideoPost('https://x.co/a/b.mp4#t=1', null)).toBe(true);
    // "mp4" no meio do nome não faz do arquivo um vídeo.
    expect(isVideoPost('https://x.co/a/mp4-tutorial.jpg', null)).toBe(false);
  });
});
