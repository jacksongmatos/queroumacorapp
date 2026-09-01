// pages/500.tsx — a página 500 ESTÁTICA do Next.
//
// A tela em si vive em `components/TelaReconectando` porque o irmão
// `pages/_error.tsx` precisa exatamente da mesma — ver o comentário lá
// sobre os DOIS caminhos de erro de servidor do Next.

import { TelaReconectando } from '@/components/TelaReconectando';

export default function ServerError() {
  return <TelaReconectando />;
}
