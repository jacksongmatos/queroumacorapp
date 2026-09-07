// REGRA DE ARQUITETURA (07/09/2026): telas (`app/`, `components/`) não fazem
// navegação de DOCUMENTO.
//
// Por quê: dentro da casca, uma navegação de documento que falhe OU seja
// cancelada faz o Capacitor carregar a `errorPath` — o `offline.html`. A
// pessoa vê "Sem conexão" em tela cheia com a internet funcionando. Foi assim
// que a Apple rejeitou a build 17 ("Continuar com Apple"), e o mesmo buraco
// engolia quem saía da conta.
//
// Troca de tela é `router.push/replace` (SPA, não recarrega nada). Link pra
// FORA do app é `abrirLinkExterno` (lib/native/browser.ts), que usa
// `window.open` — outro caminho no delegate do Capacitor, que não cancela
// navegação nenhuma.
//
// Os poucos usos legítimos de `location.href` vivem em `lib/` e são
// deliberados (o esquema `intent:` do Android, o download do PDF por URL
// assinada, e o próprio fallback web do `abrirLinkExterno`). Por isso a
// varredura é só de `app/` e `components/`: regra que ninguém verifica é
// sugestão.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const PASTAS = ['app', 'components'];
const PADRAO = /(?:window\.)?location\s*\.\s*(?:href\s*=[^=]|assign\s*\(|replace\s*\()/;

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivos(caminho));
    } else if (/\.tsx?$/.test(nome)) {
      saida.push(caminho);
    }
  }
  return saida;
}

describe('navegação de documento nas telas', () => {
  it('nenhuma tela escreve em window.location', () => {
    const infratores: string[] = [];
    for (const pasta of PASTAS) {
      for (const arquivo of arquivos(join(RAIZ, pasta))) {
        const linhas = readFileSync(arquivo, 'utf8').split('\n');
        linhas.forEach((linha, i) => {
          // Comentário explicando a regra não conta como violação.
          const semComentario = linha.replace(/^\s*(\/\/|\*).*$/, '');
          if (PADRAO.test(semComentario)) {
            infratores.push(`${arquivo.slice(RAIZ.length + 1)}:${i + 1}`);
          }
        });
      }
    }
    expect(infratores).toEqual([]);
  });
});
