// PickerRecovery — o boot depois que o Android matou o app.
//
// Motivo (2026-09-01): um pintor abre a galeria pelo "Selecionar foto",
// escolhe a foto e o app volta pra TELA INICIAL — sem foto, sem legenda e
// sem explicação. O Android encerrou o processo pra liberar RAM enquanto o
// seletor estava na frente, e o wrapper recarrega a URL inicial ao voltar
// (ver `lib/utils/pickerRecovery.ts` pro mecanismo completo).
//
// Este componente é a metade do conserto que roda no BOOT: se sobrou uma
// escolha pendente, ele devolve a pessoa pra tela onde ela estava. A outra
// metade roda na tela de destino, que é quem sabe o que fazer com a foto —
// ela consome a marca e abre o `GaleriaBloqueadaSheet` explicando o que
// houve e oferecendo a câmera (que NÃO passa pelo seletor e, por isso, é
// imune a esse problema).
//
// De propósito NÃO consome a marca: quem consome é a tela dona dela. Se
// consumisse aqui, o aviso nunca apareceria — o app navegaria de volta em
// silêncio e a pessoa continuaria sem entender o que aconteceu.

'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { lerEscolhaPendente } from '@/lib/utils/pickerRecovery';

export function PickerRecovery() {
  const router = useRouter();
  const pathname = usePathname();
  // Uma olhada por carga de página. Sem isso, cada troca de rota
  // reavaliaria a marca e poderia sequestrar a navegação de quem já
  // resolveu seguir pra outro lugar.
  const jaOlhou = useRef(false);

  useEffect(() => {
    if (jaOlhou.current) return;
    jaOlhou.current = true;
    const pendente = lerEscolhaPendente();
    if (!pendente) return;
    if (pathname === pendente.rota) return; // já estamos lá — a tela cuida
    router.replace(pendente.rota);
  }, [pathname, router]);

  return null;
}
