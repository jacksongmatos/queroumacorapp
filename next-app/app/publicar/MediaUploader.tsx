// MediaUploader — área de drag/drop + botão de selecionar arquivos. Aceita
// múltiplas imagens OU 1 vídeo (espelha a regra do vanilla handlePostFiles
// + as constraints do bucket `posts`).
//
// Não faz upload aqui: emite onFiles(files) — o pai (Composer) decide o que
// fazer (validar count/size, preview, etc). Pattern alinhado com como o
// signup-step3 lida com avatar (file input puro, lógica no pai).
//
// No app empacotado a galeria pode simplesmente não abrir (ver
// `lib/utils/filePickerWatch.ts`). Por isso existem DOIS caminhos aqui: o
// seletor de sempre e o botão "Tirar foto", que passa pela câmera e não
// depende do seletor. Quando o seletor falha, o app oferece os dois de
// novo no `GaleriaBloqueadaSheet` em vez de só avisar.

'use client';

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { CameraCapture } from '@/components/CameraCapture';
import { GaleriaBloqueadaSheet } from '@/components/GaleriaBloqueadaSheet';
import { useOfereceCamera } from '@/lib/hooks/useOfereceCamera';
import { watchFilePicker } from '@/lib/utils/filePickerWatch';
import { reportFailure } from '@/lib/utils/reportFailure';

export interface MediaUploaderProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  // accept default `image/*,video/*` — o composer pode restringir (ex.: só
  // image quando já tem um video selecionado).
  accept?: string;
}

export function MediaUploader({
  onFiles,
  disabled,
  accept = 'image/*,video/*',
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelarAviso = useRef<(() => void) | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [camAberta, setCamAberta] = useState(false);

  // Só faz sentido com câmera de verdade (celular) e quando foto é aceita:
  // no modo "só vídeo" a câmera daqui não serve.
  const podeCamera = useOfereceCamera() && accept.includes('image');

  function handleSelect() {
    if (disabled) return;
    // No app empacotado a WebView pode simplesmente NÃO abrir a galeria —
    // sem erro nenhum. Sem este aviso, o toque não faz nada e a pessoa
    // acha que o app quebrou (ver lib/utils/filePickerWatch).
    cancelarAviso.current?.();
    cancelarAviso.current = watchFilePicker(() => {
      setBloqueada(true);
      // Registra QUAL aparelho falhou. Um Android abre a galeria e outro
      // não — sem o user agent de cada um, "por que só ele?" fica no
      // palpite.
      reportFailure('picker-fail', new Error('galeria nao abriu'), { ctx: 'publicar' });
    });
    inputRef.current?.click();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    cancelarAviso.current?.();
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFiles(files);
    // Reset value pra permitir re-selecionar o mesmo arquivo após remover.
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) onFiles(files);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        aria-disabled={disabled}
        aria-label="Selecionar foto ou vídeo"
        className={[
          'flex flex-col items-center justify-center gap-2',
          'p-8 rounded-2xl border-2 border-dashed transition-colors',
          'cursor-pointer select-none text-center',
          dragOver
            ? 'border-[color:var(--color-p1)] bg-[color:var(--color-p1)]/5'
            : 'border-[color:var(--color-border)] bg-white hover:border-[color:var(--color-p1)]',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
        data-testid="media-uploader"
      >
        <div className="text-4xl" aria-hidden="true">
          📷
        </div>
        <div className="text-sm font-semibold">
          Toque pra escolher ou arraste aqui
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          Até 5 fotos ou 1 vídeo · máx 50 MB
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleChange}
          // O clique programático (inputRef.click()) SOBE até a div acima e
          // chamava handleSelect de novo — dois relógios armados, dois
          // avisos idênticos na tela. Foi o que o pintor fotografou.
          onClick={(e) => e.stopPropagation()}
          className="hidden"
          disabled={disabled}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {podeCamera ? (
        <button
          type="button"
          onClick={() => setCamAberta(true)}
          disabled={disabled}
          className={[
            'w-full px-4 py-3 rounded-2xl text-sm font-semibold',
            'bg-white border border-[color:var(--color-border)]',
            disabled ? 'opacity-50' : 'hover:border-[color:var(--color-p1)]',
          ].join(' ')}
          data-testid="media-uploader-camera"
        >
          📷 Tirar foto agora
        </button>
      ) : null}

      <CameraCapture
        open={camAberta}
        onClose={() => setCamAberta(false)}
        onCapture={(f) => onFiles([f])}
        title="Foto do trabalho"
        ctx="publicar"
      />

      <GaleriaBloqueadaSheet
        open={bloqueada}
        onClose={() => setBloqueada(false)}
        onFoto={(f) => onFiles([f])}
        urlNoNavegador="https://queroumacor.com.br/publicar"
        ctx="publicar"
      />
    </div>
  );
}
