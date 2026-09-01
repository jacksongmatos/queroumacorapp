// mediaType — o MIME do arquivo quando o Android NÃO manda MIME nenhum.
//
// Motivo (2026-09-01): trocar a foto de perfil no app instalado morria com
// "Selecione um arquivo de imagem" — a validação `file.type.startsWith
// ('image/')` recusando uma foto que era, obviamente, uma foto.
//
// O seletor do wrapper (WebIntoApp) não é a galeria do sistema: é um
// diálogo próprio, "Files Chooser", com Camera × Files. O ramo "Files"
// abre o gerenciador de arquivos, e o `File` que volta de lá muitas vezes
// chega com `type` VAZIO ou `application/octet-stream` — o content://
// provider não declarou o tipo. Pelo Chrome o mesmo arquivo vem
// `image/jpeg`, e é por isso que "no navegador funciona".
//
// Consertar só a mensagem não bastaria: o bucket `posts` (e o `avatars`)
// tem `allowed_mime_types`, então subir com octet-stream seria RECUSADO
// pelo Storage. Por isso aqui não se decide só "é imagem?" — também se
// devolve o arquivo com o `type` CORRIGIDO, pra que o upload declare o
// content type certo.
//
// Ordem de confiança: o `type` do arquivo quando ele é específico; senão a
// extensão do nome. Nunca o contrário — quem manda `image/png` num arquivo
// `.jpg` sabe mais que a gente sobre o conteúdo.

/** Extensões que o app aceita, mapeadas pro MIME que o Storage espera. */
const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
};

/**
 * Tipos que NÃO dizem nada sobre o conteúdo. `application/octet-stream` é o
 * "não sei" do Android; string vazia é o mesmo, só que mais honesto.
 */
function tipoInutil(tipo: string): boolean {
  return (
    !tipo ||
    tipo === 'application/octet-stream' ||
    tipo === 'application/unknown' ||
    tipo === 'binary/octet-stream' ||
    tipo === '*/*'
  );
}

/** Extensão em minúsculas, sem ponto. '' quando o nome não tem. */
export function extensaoDe(nome: string | null | undefined): string {
  if (!nome) return '';
  const partes = nome.split('.');
  if (partes.length < 2) return '';
  return (partes.pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * O MIME em que dá pra confiar. Devolve '' quando nem o arquivo nem a
 * extensão dizem o que é — aí é caso de recusar mesmo.
 */
export function mimeConfiavel(file: File | null | undefined): string {
  if (!file) return '';
  const tipo = (file.type || '').toLowerCase().trim();
  if (!tipoInutil(tipo)) return tipo;
  return MIME_POR_EXT[extensaoDe(file.name)] || '';
}

/** É imagem? Aceita o arquivo sem MIME cujo NOME diz que é imagem. */
export function ehImagem(file: File | null | undefined): boolean {
  return mimeConfiavel(file).startsWith('image/');
}

/** É vídeo? Mesma regra. */
export function ehVideo(file: File | null | undefined): boolean {
  return mimeConfiavel(file).startsWith('video/');
}

/**
 * O mesmo arquivo, com o `type` corrigido quando ele veio vazio/genérico.
 *
 * Devolve o arquivo ORIGINAL quando já tem tipo bom ou quando não dá pra
 * deduzir nada — nunca inventa um tipo, e nunca cria uma cópia à toa (o
 * `new File` copia a referência do blob, mas trocar a identidade do objeto
 * à toa complica comparação de estado nas telas).
 */
export function comMimeCorrigido(file: File): File {
  const bom = mimeConfiavel(file);
  if (!bom || file.type === bom) return file;
  try {
    return new File([file], file.name, {
      type: bom,
      lastModified: file.lastModified,
    });
  } catch {
    // Ambiente sem construtor de File (WebView muito antiga): melhor o
    // arquivo original que exceção na cara de quem só queria trocar a foto.
    return file;
  }
}
