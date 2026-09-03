// MediaUploader — área de drag/drop + botão de selecionar arquivos. Aceita
// múltiplas imagens OU 1 vídeo (espelha a regra do vanilla handlePostFiles
// + as constraints do bucket `posts`).
//
// Não faz upload aqui: emite onFiles(files) — o pai (Composer) decide o que
// fazer (validar count/size, preview, etc). Pattern alinhado com como o
// signup-step3 lida com avatar (file input puro, lógica no pai).

'use client';

import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { native } from '@/lib/native';

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
  const [dragOver, setDragOver] = useState(false);
  // Câmera NATIVA (casca Capacitor com plugin Camera): botão extra, aditivo.
  // Detecção no effect (não no render) — `window.Capacitor` só existe no
  // client e o plugin pode registrar depois do 1º paint.
  const [hasNativeCamera, setHasNativeCamera] = useState(false);
  useEffect(() => {
    setHasNativeCamera(native.camera.isAvailable());
  }, []);

  function handleSelect() {
    if (disabled) return;
    inputRef.current?.click();
  }

  async function handleNativeCamera() {
    if (disabled) return;
    const result = await native.camera.takePhoto('CAMERA');
    if (result.status === 'ok') {
      onFiles([result.file]);
      return;
    }
    // 'cancelled' = usuário desistiu no prompt nativo — não abrir outro
    // seletor em cima. 'unavailable'/'error' = cai pro input file de sempre.
    if (result.status !== 'cancelled') handleSelect();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
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
      {hasNativeCamera && accept.includes('image') && (
        <button
          type="button"
          onClick={(e) => {
            // Não deixar o clique borbulhar pro tile (que abriria o input).
            e.stopPropagation();
            void handleNativeCamera();
          }}
          disabled={disabled}
          className="mt-1 px-4 py-2 rounded-full text-sm font-semibold text-white bg-[color:var(--color-p1)] disabled:opacity-50"
          aria-label="Tirar foto com a câmera"
        >
          📸 Tirar foto
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
