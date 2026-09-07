// enquadrarImagem — aplica o enquadramento escolhido no composer ao
// arquivo ANTES do upload. O feed não sabe de nada: recebe uma foto que
// já tem a proporção escolhida e a mostra inteira.
//
// Por que recortar no upload e não na tela: o feed, o perfil, o carrossel e
// o "Em alta" renderizam a mesma URL de jeitos diferentes. Se o
// enquadramento fosse só CSS, cada tela teria que conhecer o deslocamento
// gravado — e a primeira que esquecesse voltaria a cortar a obra no meio.
//
// 'original' devolve o MESMO File (identidade preservada): nada de
// recomprimir quem não pediu recorte.

import {
  caixaContain,
  ratioDe,
  recorteCover,
  tamanhoSaida,
  type Deslocamento,
  type ModoEnquadramento,
  type ProporcaoKey,
} from '@/lib/enquadramento';
import { COMPRESS_MAX_DIM } from '@/lib/services/posts';

export const ENQUADRAR_QUALIDADE = 0.9;
// Fundo que sobra no modo "ajustar" quando o navegador não sabe desfocar
// (canvas sem `filter`): creme do brand, o mesmo do placeholder do feed.
const FUNDO_NEUTRO = '#f3ede4';

export interface EnquadrarOpcoes {
  proporcao: ProporcaoKey;
  modo: ModoEnquadramento;
  deslocamento: Deslocamento;
}

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const limpar = () => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    };
    img.onload = () => {
      limpar();
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('imagem sem dimensões'));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      limpar();
      reject(new Error('não foi possível decodificar a imagem'));
    };
    img.src = url;
  });
}

export async function enquadrarImagem(file: File, op: EnquadrarOpcoes): Promise<File> {
  const proporcao = ratioDe(op.proporcao);
  if (proporcao == null) return file;
  if (typeof document === 'undefined') {
    throw new Error('enquadrarImagem só roda no browser.');
  }

  const img = await carregarImagem(file);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const { w, h } = tamanhoSaida(imgW, imgH, proporcao, op.modo, COMPRESS_MAX_DIM);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas sem contexto 2d');

  if (op.modo === 'preencher') {
    const r = recorteCover(imgW, imgH, proporcao, op.deslocamento);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  } else {
    // Fundo: a própria foto esticada e desfocada (como o Instagram faz
    // com vídeo em pé). Sem suporte a filter, cor lisa — feio é melhor
    // que quebrado.
    // Checado em runtime sem estreitar o tipo: a tipagem diz que `filter`
    // sempre existe, mas WebView antiga não tem (e o `else` viraria `never`).
    const temFiltro = typeof (ctx as { filter?: unknown }).filter === 'string';
    if (temFiltro) {
      const fundo = recorteCover(imgW, imgH, proporcao, { x: 0.5, y: 0.5 });
      ctx.save();
      ctx.filter = 'blur(24px)';
      // Desenha um pouco além da borda: o blur escurece as beiradas.
      ctx.drawImage(img, fundo.sx, fundo.sy, fundo.sw, fundo.sh, -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = FUNDO_NEUTRO;
      ctx.fillRect(0, 0, w, h);
    }
    const c = caixaContain(w, h, imgW, imgH);
    ctx.drawImage(img, 0, 0, imgW, imgH, c.dx, c.dy, c.dw, c.dh);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', ENQUADRAR_QUALIDADE),
  );
  if (!blob) throw new Error('canvas vazio');
  const base = (file.name || 'foto').replace(/\.[^/.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
