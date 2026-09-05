'use client';
// SignupStep2 — dados básicos do cadastro. Espelha o `#signup-step2` do
// vanilla (index.html linha 380+): nome + foto de perfil + tag + email +
// WhatsApp + data de nascimento + cidade + estado. Senha fica no Step 3.
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  emailSchema,
  tagSchema,
  phoneSchema,
  phoneOptionalSchema,
  personNameSchema,
  birthDateSchema,
  calculateAge,
  MIN_AGE,
  limparNome,
  limparTag,
  sugerirTagDeNome,
  mascararDataBR,
  dataBRParaISO,
  isoParaDataBR,
} from '@/lib/schemas';
import { useTagAvailability } from '@/lib/hooks/useTagAvailability';
import { CameraCapture } from '@/components/CameraCapture';
import { native } from '@/lib/native';
import { useOfereceCamera } from '@/lib/hooks/useOfereceCamera';
import type { UserRole } from '@/lib/types';
import { ehImagem } from '@/lib/utils/mediaType';

// 27 UFs brasileiras (vanilla index.html linha 430+).
const UFS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
];

// (o antigo `maxBirthISO` existia pro atributo `max` do <input type="date">,
// que saiu junto com o seletor nativo — a idade é checada por
// `birthDateSchema` e, em tempo real, por `birthTooYoung` abaixo.)

// Schema parametrizado pelo tipo de usuário: pro Cliente o WhatsApp é
// OPCIONAL (Apple 5.1.1 — não exigir telefone quando não é estritamente
// necessário pra conta); pros profissionais segue obrigatório (é o canal de
// contato de orçamentos/leads).
function makeSchema(phoneRequired: boolean) {
  return z.object({
    name: personNameSchema,
    tag: tagSchema,
    email: emailSchema,
    phone: phoneRequired ? phoneSchema : phoneOptionalSchema,
    // birthDate é obrigatório (LGPD-K + Apple 1.6 + Google Family Policy).
    // birthDateSchema bloqueia menores de MIN_AGE (18 anos).
    birthDate: birthDateSchema,
    city: z.string().trim().max(80, 'Cidade muito longa').optional().default(''),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === '' || UFS.some((u) => u.value === v), {
        message: 'UF inválida',
      })
      .optional()
      .default(''),
  });
}

export type Step2Data = z.infer<ReturnType<typeof makeSchema>> & { avatarFile?: File | null };

interface Props {
  /** Categoria escolhida no Step 1. Define se o WhatsApp é obrigatório. */
  userType?: UserRole;
  initial?: Partial<Step2Data>;
  onNext: (data: Step2Data) => void;
  onBack: () => void;
}

export function SignupStep2({ userType, initial, onNext, onBack }: Props) {
  const isCliente = userType === 'cliente';
  const schema = useMemo(() => makeSchema(!isCliente), [isCliente]);

  const [avatarFile, setAvatarFile] = useState<File | null>(initial?.avatarFile ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [camAberta, setCamAberta] = useState(false);
  const podeCamera = useOfereceCamera();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Step2Data>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      tag: initial?.tag ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      birthDate: initial?.birthDate ?? '',
      city: initial?.city ?? '',
      state: initial?.state ?? '',
    },
  });

  // Restaura o preview da foto ao voltar pro passo 2 com um arquivo já
  // escolhido (BUG fix: antes a foto era preservada mas o thumbnail sumia).
  useEffect(() => {
    if (avatarFile && !avatarPreview) {
      const reader = new FileReader();
      reader.onload = (ev) => setAvatarPreview(String(ev.target?.result ?? ''));
      reader.readAsDataURL(avatarFile);
    }
  }, [avatarFile, avatarPreview]);

  const tagValue = watch('tag');
  const tagStatus = useTagAvailability(tagValue);
  const nameValue = watch('name');

  // Data de nascimento como TEXTO com máscara. O form guarda ISO
  // (`birthDate`); este state guarda o que está escrito na tela. Ao voltar
  // pro passo 2, repopula do ISO que já existe.
  const [dataTexto, setDataTexto] = useState(() =>
    isoParaDataBR(initial?.birthDate ?? ''),
  );

  // Sugestão de @ a partir do nome. Só aparece enquanto o campo está VAZIO —
  // depois que a pessoa escreve algo, sugerir por cima seria roubar o que ela
  // digitou. `tagTocada` marca que ela já mexeu.
  const [tagTocada, setTagTocada] = useState(Boolean(initial?.tag));
  const tagSugerida = tagTocada ? '' : sugerirTagDeNome(nameValue || '');

  // Validação de idade em tempo real (Apple 5.1.1 / Google Family): assim que
  // o usuário escolhe uma data, já avisamos se é menor de MIN_AGE — sem
  // esperar o submit. birthTooYoung também desabilita o "Continuar".
  const birthValue = watch('birthDate');
  const birthAge = birthValue ? calculateAge(birthValue) : -1;
  const birthTooYoung = birthAge >= 0 && birthAge < MIN_AGE;

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    aceitarFoto(e.target.files?.[0] ?? null);
  }

  /** Vem da galeria ou da câmera — no app empacotado a galeria não abre. */
  function aceitarFoto(file: File | null) {
    if (!file) return;
    // MIME vazio = seletor do wrapper, não arquivo inválido.
    if (!ehImagem(file)) return;
    if (file.size > 5 * 1024 * 1024) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(String(ev.target?.result ?? ''));
    reader.readAsDataURL(file);
  }

  function onSubmit(data: Step2Data) {
    if (tagStatus === 'taken') return;
    // Foto agora é OPCIONAL no cadastro (2026-08-28): no wrapper Android,
    // abrir a galeria manda o app pro fundo e o sistema pode matar o
    // processo — o usuário voltava pra tela inicial com o cadastro perdido
    // e, com a foto obrigatória, não tinha como completar a conta. A foto
    // pode ser adicionada depois em /perfil/editar sem risco.
    onNext({ ...data, avatarFile });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <h1
        className="text-2xl font-bold mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Seus dados
      </h1>
      <p className="text-sm text-[color:var(--color-muted)] -mt-1">
        Preencha as informações básicas
      </p>

      <Field id="name" label="Nome completo" error={errors.name?.message}>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome"
          {...register('name')}
          // Filtra na digitação: número e símbolo não chegam a aparecer.
          // Impedir na hora ensina mais que recusar no submit — e o schema
          // (`personNameSchema`) segue valendo como defesa real.
          onChange={(e) => {
            const limpo = limparNome(e.target.value);
            if (limpo !== e.target.value) e.target.value = limpo;
            void register('name').onChange(e);
          }}
          className={inputClass}
          aria-invalid={errors.name ? 'true' : 'false'}
        />
        <p className="text-xs text-[color:var(--color-muted)] mt-1">
          Só letras — sem números ou símbolos.
        </p>
      </Field>

      {/* Foto de perfil — OPCIONAL (upload acontece em handleStep3 quando
          escolhida). No wrapper Android o seletor pode derrubar o app, então
          nunca pode ser porta obrigatória do cadastro. */}
      <div>
        <label
          className="block text-sm font-semibold mb-1 text-[color:var(--color-ink)]"
        >
          Foto de perfil (opcional)
        </label>
        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--color-border)',
              border: '2px solid var(--color-border)',
            }}
          >
            {avatarPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarPreview}
                alt="Pré-visualização"
                className="w-full h-full object-cover"
              />
            ) : (
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
          <label
            className="flex-1 text-center py-2.5 border-2 border-[color:var(--color-border)] text-[color:var(--color-ink)] rounded-xl font-bold text-sm cursor-pointer hover:bg-[color:var(--color-bg)] transition-colors"
            onClick={(e) => {
              // Picker nativo primeiro (só-imagem). Fallback: <input>.
              if (native.camera.isPickerAvailable()) {
                e.preventDefault();
                void (async () => {
                  const r = await native.camera.pickImages(1);
                  if (r.status === 'ok' && r.files[0]) aceitarFoto(r.files[0]);
                })();
              }
            }}
          >
            Escolher foto
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarPick}
            />
          </label>
          {podeCamera ? (
            <button
              type="button"
              onClick={async () => {
                // Câmera nativa primeiro; fallback CameraCapture web.
                const r = await native.camera.takePhoto('CAMERA');
                if (r.status === 'ok') {
                  aceitarFoto(r.file);
                  return;
                }
                if (r.status === 'cancelled') return;
                setCamAberta(true);
              }}
              className="py-2.5 px-3 border-2 border-[color:var(--color-border)] rounded-xl font-bold text-sm"
              data-testid="signup-avatar-camera"
            >
              📷
            </button>
          ) : null}
        </div>
        <CameraCapture
          open={camAberta}
          facing="user"
          title="Foto de perfil"
          onClose={() => setCamAberta(false)}
          onCapture={aceitarFoto}
          ctx="signup"
        />
        <p className="text-xs text-[color:var(--color-muted)] mt-1">
          Aparece no seu story e perfil. Dá pra adicionar depois em Perfil →
          Editar.
        </p>
      </div>

      <Field id="tag" label="Sua tag única" error={errors.tag?.message}>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)] font-semibold pointer-events-none"
            aria-hidden="true"
          >
            @
          </span>
          <input
            id="tag"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="seunomedeusuario"
            {...register('tag')}
            // Mesma ideia do nome: espaço, número, símbolo e acento não
            // chegam a entrar. `limparTag` também derruba pra minúsculo, que
            // é o formato que o banco guarda.
            onChange={(e) => {
              const limpo = limparTag(e.target.value);
              if (limpo !== e.target.value) e.target.value = limpo;
              setTagTocada(true);
              void register('tag').onChange(e);
            }}
            className={inputClass + ' pl-8'}
            aria-invalid={errors.tag ? 'true' : 'false'}
          />
        </div>
        <p className="text-xs text-[color:var(--color-muted)] mt-1">
          Só letras — sem espaço, número ou símbolo.
        </p>
        {tagSugerida && !tagValue && (
          <button
            type="button"
            onClick={() => {
              setTagTocada(true);
              setValue('tag', tagSugerida, { shouldValidate: true });
            }}
            className="text-xs mt-1 font-semibold text-[color:var(--color-p1)] underline underline-offset-2"
          >
            Usar @{tagSugerida}
          </button>
        )}
        {!errors.tag && tagValue && (
          <p
            className={
              'text-xs mt-1 ' +
              (tagStatus === 'available'
                ? 'text-[color:var(--color-p1)]'
                : tagStatus === 'taken'
                  ? 'text-[color:var(--color-danger)]'
                  : 'text-[color:var(--color-muted)]')
            }
            role="status"
            aria-live="polite"
          >
            {tagStatus === 'checking' && 'Verificando disponibilidade...'}
            {tagStatus === 'available' && `@${tagValue} está disponível!`}
            {tagStatus === 'taken' && `@${tagValue} já está em uso.`}
            {tagStatus === 'invalid' && 'Use 3 letras ou mais, sem número ou símbolo.'}
          </p>
        )}
      </Field>

      <Field id="email" label="Email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          {...register('email')}
          className={inputClass}
          aria-invalid={errors.email ? 'true' : 'false'}
        />
      </Field>

      <Field
        id="phone"
        label={isCliente ? 'WhatsApp (opcional)' : 'WhatsApp'}
        error={errors.phone?.message}
      >
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          {...register('phone')}
          className={inputClass}
          aria-invalid={errors.phone ? 'true' : 'false'}
        />
        <p className="text-xs text-[color:var(--color-muted)] mt-1">
          {isCliente
            ? 'Opcional. Se informar, usamos só para contato sobre orçamentos e suporte.'
            : 'Usado para contato sobre orçamentos e suporte.'}
        </p>
      </Field>

      <Field id="birthDate" label="Data de nascimento" error={errors.birthDate?.message}>
        {/* TEXTO com máscara, não <input type="date"> (2026-09-05). O seletor
            nativo do celular abre no ano atual e escolher o ano de nascimento
            exige rolar décadas — quem nasceu em 1975 rola meio século pra
            cadastrar. Digitando, são 8 toques.

            O form guarda ISO em `birthDate` (é o que `birthDateSchema` e o
            banco esperam); `dataTexto` é só o que aparece na tela. Enquanto a
            data não estiver completa E válida, o ISO fica '' — e o schema
            barra, em vez de deixar passar meia data. */}
        <input
          id="birthDate"
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          value={dataTexto}
          onChange={(e) => {
            const texto = mascararDataBR(e.target.value);
            setDataTexto(texto);
            setValue('birthDate', dataBRParaISO(texto), {
              shouldValidate: texto.length === 10,
            });
          }}
          className={inputClass}
          aria-invalid={errors.birthDate ? 'true' : 'false'}
        />
        {/* O campo real do form. `register` precisa existir pro RHF conhecer
            `birthDate`; escondido porque quem a pessoa preenche é o de cima. */}
        <input type="hidden" {...register('birthDate')} />
        {birthTooYoung ? (
          <p className="text-sm text-[color:var(--color-danger)] mt-1" role="alert">
            Você precisa ter {MIN_AGE} anos ou mais para usar o app.
          </p>
        ) : (
          <p className="text-xs text-[color:var(--color-muted)] mt-1">
            É necessário ter {MIN_AGE} anos ou mais para usar o app.
          </p>
        )}
      </Field>

      <Field id="city" label="Cidade" error={errors.city?.message}>
        <input
          id="city"
          type="text"
          autoComplete="address-level2"
          placeholder="São Paulo"
          {...register('city')}
          className={inputClass}
          aria-invalid={errors.city ? 'true' : 'false'}
        />
      </Field>

      <Field id="state" label="Estado" error={errors.state?.message}>
        <select
          id="state"
          autoComplete="address-level1"
          {...register('state')}
          className={inputClass}
          aria-invalid={errors.state ? 'true' : 'false'}
        >
          <option value="">Selecione o estado</option>
          {UFS.map((uf) => (
            <option key={uf.value} value={uf.value}>
              {uf.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 border-2 border-[color:var(--color-border)] text-[color:var(--color-ink)] rounded-xl font-bold text-base hover:bg-[color:var(--color-bg)] transition-colors"
        >
          ← Voltar
        </button>
        <button
          type="submit"
          disabled={isSubmitting || tagStatus === 'taken' || tagStatus === 'checking' || birthTooYoung}
          className="flex-1 py-3 bg-[color:var(--color-p1)] text-white rounded-xl font-bold text-base hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          Continuar →
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full px-4 py-3 text-base bg-white border-[1.5px] border-[color:var(--color-border)] focus:border-[color:var(--color-p1)] rounded-xl outline-none transition-colors';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold mb-1 text-[color:var(--color-ink)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-sm text-[color:var(--color-danger)] mt-1">{error}</p>
      )}
    </div>
  );
}
