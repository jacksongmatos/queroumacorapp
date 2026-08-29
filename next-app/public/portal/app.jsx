const { useState, useEffect } = React;
// Otimizações usadas como React.useMemo / React.useCallback / React.memo abaixo.

const supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);

const C = {
  ink: '#1a1a2e', ink2: '#16213e', cream: '#f7f3ee', border: '#e8e2d9',
  muted: '#9e9687', white: '#ffffff',
  p1: '#ff6b35', p2: '#f7c59f', p3: '#2ec4b6', p4: '#e63946',
  p5: '#8338ec', p6: '#06d6a0', p7: '#ffd166',
  bg: '#f7f3ee', sidebar: '#1a1a2e'
};

// ============================================================
// StatusBadge — chip de status reutilizavel (cor + label).
// Recebe `status`, mapa de cores e mapa de labels.
// ============================================================
const StatusBadge = React.memo(function StatusBadge({ status, colorMap, labelMap, size }) {
  const s = size || 'sm';
  const bg = (colorMap && colorMap[status]) || '#e5e7eb';
  const label = (labelMap && labelMap[status]) || status;
  const fontSize = s === 'sm' ? 11 : 12;
  return (
    <span style={{
      display:'inline-block', padding: s === 'sm' ? '2px 8px' : '4px 12px',
      background: bg, color:'#fff', borderRadius:20, fontSize, fontWeight:700
    }}>{label}</span>
  );
});

// Maps de cor/label para os varios chips de status do portal.
// (LEAD_STATUS_COLORS / LEAD_SEG_COLORS ja existem mais abaixo perto do componente Leads.)
const POSTS_STATUS_COLORS = { approved: '#28a745', rejected: '#e74c3c', pending: '#f0ad4e' };
const POSTS_STATUS_LABELS = { approved: 'Aprovado', rejected: 'Rejeitado', pending: 'Pendente' };

const REPORTS_STATUS_COLORS = { pending: '#b8860b', resolved: '#06d6a0', dismissed: '#9e9687' };
const REPORTS_STATUS_LABELS = { pending: 'Pendente', resolved: 'Resolvida', dismissed: 'Descartada' };

const REFERRALS_STATUS_COLORS = { completed: '#06d6a0', pending: '#b8860b', cancelled: '#e63946' };
const REFERRALS_STATUS_LABELS = { completed: 'Completa', pending: 'Pendente', cancelled: 'Cancelada' };

// Status de fulfillment (setados pelo admin) + de pagamento (setados pelo
// webhook do MP). Grafia 'canceled' (1 L) pra casar com o constraint do banco.
const ORDERS_STATUS_COLORS = { pending: '#ffd166', processing: '#ff6b35', shipped: '#2ec4b6', completed: '#06d6a0', canceled: '#e63946', paid: '#06d6a0', amount_mismatch: '#e63946', refunded: '#8338ec' };
const ORDERS_STATUS_LABELS = { pending: 'Aguardando', processing: 'Em andamento', shipped: 'Enviado', completed: 'Concluido', canceled: 'Cancelado', paid: 'Pago', amount_mismatch: 'Divergencia valor', refunded: 'Reembolsado' };

const LEADS_STATUS_LABELS = { novo: 'Novo', contactado: 'Contactado', qualificado: 'Qualificado', convertido: 'Convertido', perdido: 'Perdido' };

// ============================================================
// Services CRUD — wrappers de supabase com erro via throw.
// Quem chama DEVE try/catch.
// ============================================================
const productsService = {
  list: () => buscarTudo(() => supa.from('products').select('*').order('name')),
  upsert: async (p) => { const r = await supa.from('products').upsert(p); if (r.error) throw r.error; return r.data; },
  remove: async (id) => { const r = await supa.from('products').delete().eq('id', id); if (r.error) throw r.error; }
};

// PostgREST corta a resposta em 1000 linhas (max-rows do Supabase) e NAO
// avisa: a lista so vem curta. Foi o que aconteceu com os leads — o banco
// tinha 1072 e a tela mostrava 1000, com 72 invisiveis. Toda listagem que
// pode passar de mil linhas precisa passar por aqui.
const PAGINA_SUPA = 1000;
async function buscarTudo(montarQuery) {
  const tudo = [];
  for (let de = 0; de < 50000; de += PAGINA_SUPA) {
    const r = await montarQuery().range(de, de + PAGINA_SUPA - 1);
    if (r.error) throw r.error;
    const lote = r.data || [];
    tudo.push(...lote);
    if (lote.length < PAGINA_SUPA) break;
  }
  return tudo;
}

const leadsService = {
  list: () => buscarTudo(() => supa.from('leads').select('*').order('created_at', { ascending:false })),
  updateStatus: async (id, status) => { const r = await supa.from('leads').update({status}).eq('id', id); if (r.error) throw r.error; },
  remove: async (id) => { const r = await supa.from('leads').delete().eq('id', id); if (r.error) throw r.error; },
  insertBatch: async (rows) => { const r = await supa.from('leads').insert(rows); if (r.error) throw r.error; return r.data; }
};

const announcementsService = {
  list: async () => { const r = await supa.from('announcements').select('*').order('created_at', {ascending:false}); if (r.error) throw r.error; return r.data || []; },
  insert: async (a) => { const r = await supa.from('announcements').insert(a); if (r.error) throw r.error; },
  toggle: async (id, active) => { const r = await supa.from('announcements').update({active}).eq('id', id); if (r.error) throw r.error; },
  remove: async (id) => { const r = await supa.from('announcements').delete().eq('id', id); if (r.error) throw r.error; }
};

const postsService = {
  setStatus: async (id, status) => { const r = await supa.from('posts').update({status}).eq('id', id); if (r.error) throw r.error; },
  deleteWithChildren: async (id) => {
    await supa.from('likes').delete().eq('post_id', id);
    await supa.from('comments').delete().eq('post_id', id);
    const r = await supa.from('posts').delete().eq('id', id);
    if (r.error) throw r.error;
  }
};

const ordersService = {
  updateStatus: async (id, status) => { const r = await supa.from('orders').update({status}).eq('id', id); if (r.error) throw r.error; }
};

const reportsService = {
  resolve: async (id) => { const r = await supa.from('reports').update({status:'resolved'}).eq('id', id); if (r.error) throw r.error; }
};

// Cria um usuario via cliente Supabase efemero (storageKey unico), para nao
// invalidar a sessao do admin logado. Faz auth.signUp + upsert em profiles e
// sempre fecha a sessao do cliente efemero no finally.
//
// Args:
//   - name, email, password: obrigatorios (password >= 8)
//   - role: 'cliente' | 'pintor' | 'grafiteiro' | 'automotivo' | 'admin'
//   - profession: opcional (rotulo extra; ex.: 'funileiro')
//   - portalAccess: se true, marca profile.portal_access = true
//   - inviteCode: se passado, grava em profile.invite_code_used
//   - userMetadata: campos extras para options.data do auth.signUp
//   - extraProfile: campos extras para o upsert em profiles (email, tag,
//     invited_by, user_type, etc.) — permite cada chamador manter o shape
//     exato que ja gravava antes do refactor.
//
// Retorno: { ok: true, userId } em sucesso ou { ok: false, error } em falha.
const authService = {
  async signUpAppUser({ name, email, password, role, profession, portalAccess, inviteCode, userMetadata, extraProfile }) {
    if (!email || !password) {
      return { ok: false, error: 'Email e senha sao obrigatorios' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Senha deve ter no minimo 8 caracteres' };
    }
    const cleanEmail = (email || '').trim();
    const cleanName = (name || '').trim();
    const ephemeral = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-portal-app-create-' + Date.now() }
    });
    try {
      const signUpOptions = { data: Object.assign({ name: cleanName || cleanEmail }, userMetadata || {}) };
      const { data: authData, error: authErr } = await ephemeral.auth.signUp({
        email: cleanEmail,
        password,
        options: signUpOptions
      });
      if (authErr) throw authErr;
      const userId = authData && authData.user && authData.user.id;
      if (!userId) return { ok: false, error: 'Nao foi possivel criar usuario' };

      const profile = Object.assign({
        id: userId,
        name: cleanName || cleanEmail,
        role,
        created_at: new Date().toISOString()
      }, extraProfile || {});
      if (profession) profile.profession = profession;
      if (portalAccess) profile.portal_access = true;
      if (inviteCode) profile.invite_code_used = inviteCode;

      const { error: profErr } = await ephemeral.from('profiles').upsert(profile, { onConflict: 'id' });
      if (profErr) {
        console.warn('authService: profile upsert falhou', profErr.message);
        return { ok: false, error: profErr.message || 'Erro ao salvar perfil' };
      }
      return { ok: true, userId };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    } finally {
      try { await ephemeral.auth.signOut(); } catch(_) {}
    }
  }
};

// Classificacao de perfis (consistente em todo o portal)
const PRO_ROLES = ['pintor','grafiteiro','graffiti','automotivo','funileiro'];
const roleOf = p => ((p && (p.role || p.user_type)) || '').toString().trim().toLowerCase();
// Obs: a coluna profession tem DEFAULT 'pintor', entao NAO serve para
// classificar (marcaria todo cliente como profissional). Usada so no rotulo.
const professionOf = p => ((p && p.profession) || '').toString().trim().toLowerCase();
const isProProfile = p => PRO_ROLES.includes(roleOf(p));
const isPortalStaff = p => roleOf(p) === 'admin' || (p && p.portal_access === true);
// Cliente = qualquer perfil cadastrado que nao seja profissional nem staff do portal
const isClienteProfile = p => !isProProfile(p) && roleOf(p) !== 'admin';
const ROLE_LABEL = { pintor:'Pintor', grafiteiro:'Grafiteiro/Muralista', graffiti:'Grafiteiro/Muralista', automotivo:'Pintor Automotivo', funileiro:'Funileiro', cliente:'Cliente', admin:'Admin' };
const tipoLabel = p => ROLE_LABEL[professionOf(p)] || ROLE_LABEL[roleOf(p)] || (roleOf(p) || 'Cliente');

// Opcoes de papel para criar usuario do app (mesmo modelo do cadastro no app)
const APP_ROLE_OPTIONS = [
  { v:'pintor', label:'Pintor', role:'pintor' },
  { v:'grafiteiro', label:'Grafiteiro / Muralista', role:'grafiteiro' },
  { v:'automotivo', label:'Pintor Automotivo', role:'automotivo' },
  { v:'funileiro', label:'Funileiro', role:'automotivo', profession:'funileiro' },
  { v:'cliente', label:'Cliente', role:'cliente' },
];

const CreateAppUserForm = ({ onCreated, defaultRole }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'', roleKey: defaultRole || 'pintor' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setErr(''); setMsg('');
    const name = form.name.trim(), email = form.email.trim(), password = form.password;
    if (!email || !password) { setErr('Email e senha sao obrigatorios'); return; }
    if (password.length < 8) { setErr('Senha deve ter no minimo 8 caracteres'); return; }
    const opt = APP_ROLE_OPTIONS.find(o => o.v === form.roleKey) || APP_ROLE_OPTIONS[0];
    setSaving(true);
    try {
      const tag = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '') + '_' + Math.random().toString(36).slice(2, 7);
      const res = await authService.signUpAppUser({
        name: name || email,
        email,
        password,
        role: opt.role,
        profession: opt.profession,
        userMetadata: { user_type: opt.role, tag },
        extraProfile: { email, tag, user_type: opt.role }
      });
      if (!res.ok) { setErr(res.error || 'Erro ao criar usuario'); return; }
      setMsg('Usuario criado. Ja pode entrar no app com essas credenciais.');
      setForm({ name:'', email:'', password:'', roleKey: defaultRole || 'pintor' });
      setOpen(false);
      if (onCreated) onCreated();
    } catch (e) {
      setErr(e.message || 'Erro ao criar usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom:16 }}>
      <button onClick={() => { setOpen(!open); setErr(''); setMsg(''); }} style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
        {open ? 'Cancelar' : '+ Criar usuario do app'}
      </button>
      {msg && <div style={{ color:C.p6, fontSize:13, marginTop:8 }}>{msg}</div>}
      {open && (
        <div style={{ background:C.cream, borderRadius:12, padding:16, marginTop:12, border:'1px solid '+C.border }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Nome</div>
              <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Nome (opcional)" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Email</div>
              <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="email@exemplo.com" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Senha</div>
              <input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} placeholder="Minimo 6 caracteres" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Tipo de perfil</div>
              <select value={form.roleKey} onChange={e=>setForm({...form, roleKey:e.target.value})} style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none', background:'#fff' }}>
                {APP_ROLE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {err && <div style={{ color:'#e63946', fontSize:13, marginBottom:10 }}>{err}</div>}
          <button disabled={saving} onClick={submit} style={{ background:C.p6, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', cursor: saving?'wait':'pointer', fontSize:13, fontWeight:700 }}>
            {saving ? 'Criando...' : 'Criar usuario'}
          </button>
        </div>
      )}
    </div>
  );
};

// O update direto em profiles de outra pessoa falha silenciosamente
// por RLS (unica policy de UPDATE e auth.uid() = id). Por isso tudo
// vai pelo endpoint /api/admin/users com service role.
// (era /api/admin-users no Cloudflare Function; virou rota Next em app/api/admin/users)
// Versao "crua": devolve { ok, error } SEM alert — a exclusao em massa usa
// isso pra agregar as falhas num relatorio unico em vez de 1 alerta por conta.
const adminUsersRaw = async (payload) => {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) return { ok: false, error: 'Sessao expirada. Entre novamente.' };
  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: session.access_token, ...payload })
  });
  // Le como TEXTO primeiro: quando o 5xx vem do PROPRIO Cloudflare (a
  // function morreu), o corpo e uma pagina HTML — o res.json() falhava
  // mudo e o relatorio mostrava so "HTTP 502", impossivel saber a origem.
  // Agora o trecho cru do corpo entra no relatorio.
  let raw = '';
  try { raw = await r.text(); } catch (_) {}
  let res = {};
  try { res = JSON.parse(raw); } catch (_) {}
  if (!r.ok || !res.ok) {
    const snippet = res.error ? '' : (raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    return { ok: false, status: r.status, error: res.error || ('HTTP ' + r.status + (snippet ? ' — corpo: "' + snippet + '"' : ' (sem corpo)')) };
  }
  return { ok: true };
};

// Igual ao adminUsers, mas DEVOLVE o corpo da resposta — algumas actions
// respondem com DADO (sync_email traz o e-mail de login), nao so ok/erro.
// Em falha: alerta (mesma mensagem) e devolve null.
const adminUsersData = async (payload) => {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { alert('Sessao expirada. Entre novamente.'); return null; }
  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: session.access_token, ...payload })
  });
  let res = {};
  try { res = await r.json(); } catch (_) {}
  if (!r.ok || !res.ok) {
    if (r.status === 503 || /SERVICE_ROLE_KEY/i.test(res.error || '')) {
      alert('Gestao de usuarios indisponivel.\n\nO servidor ainda nao esta configurado para esta acao. ' +
            'E preciso definir a variavel de ambiente SUPABASE_SERVICE_ROLE_KEY no Cloudflare Pages ' +
            '(Settings -> Environment variables -> Production) e refazer o deploy.\n\n' +
            'Fale com o responsavel tecnico para concluir essa configuracao.');
    } else {
      alert('A acao falhou: ' + (res.error || ('HTTP ' + r.status)));
    }
    return null;
  }
  return res;
};

// Boolean pra maioria das actions (o resto do portal ja usa assim).
const adminUsers = async (payload) => !!(await adminUsersData(payload));

const promoteToPortal = async (id, after) => {
  if (!confirm('Promover este perfil a usuario do portal? Ele passara a ter acesso ao portal administrativo.')) return;
  if (await adminUsers({ action:'promote', userId:id }) && after) after();
};

const revokePortal = async (id, after) => {
  if (!confirm('Remover o acesso ao portal deste usuario?')) return;
  if (await adminUsers({ action:'revoke', userId:id }) && after) after();
};

const setProfileVerified = async (id, value, after) => {
  if (await adminUsers({ action:'verify', userId:id, value }) && after) after();
};

// Edita a @tag pelo portal. REGRA DO APP: tag nunca fica vazia (busca e
// link de perfil dependem dela) — o backend recusa vazio/duplicada.
const editUserTag = async (profile, after) => {
  let v = prompt(
    'Nova @tag para ' + (profile.name || 'este perfil') +
    '\n(3 a 24 caracteres: a-z, 0-9, _ — NAO pode ficar vazia)',
    profile.tag || ''
  );
  if (v === null) return;
  v = v.trim().replace(/^@+/, '').toLowerCase();
  if (!v) { alert('A @tag nao pode ficar vazia — regra do app (busca e link do perfil dependem dela).'); return; }
  if (!/^[a-z0-9_]{3,24}$/.test(v)) { alert('@tag invalida: use 3 a 24 caracteres (a-z, 0-9, _).'); return; }
  if (v === profile.tag) return;
  if (await adminUsers({ action:'set_tag', userId: profile.id, tag: v }) && after) after();
};

// Edita o nome de exibicao (2 a 60 caracteres).
const editUserName = async (profile, after) => {
  let v = prompt('Novo nome para ' + (profile.name || 'este perfil') + ':', profile.name || '');
  if (v === null) return;
  v = v.trim().replace(/\s+/g, ' ');
  if (v.length < 2 || v.length > 60) { alert('Nome invalido: use de 2 a 60 caracteres.'); return; }
  if (v === profile.name) return;
  if (await adminUsers({ action:'set_name', userId: profile.id, name: v }) && after) after();
};

// Edita cidade (vazio limpa).
const editUserCity = async (profile, after) => {
  let v = prompt('Cidade de ' + (profile.name || 'este perfil') + ' (vazio pra limpar):', profile.city || '');
  if (v === null) return;
  v = v.trim();
  if (v.length > 60) { alert('Cidade muito longa (max 60 caracteres).'); return; }
  if (v === (profile.city || '')) return;
  if (await adminUsers({ action:'set_info', userId: profile.id, city: v }) && after) after();
};

// Edita a UF (2 letras; vazio limpa).
const editUserState = async (profile, after) => {
  let v = prompt('Estado (UF, 2 letras — ex.: SP) de ' + (profile.name || 'este perfil') + ' (vazio pra limpar):', profile.state || '');
  if (v === null) return;
  v = v.trim().toUpperCase();
  if (v && !/^[A-Z]{2}$/.test(v)) { alert('UF invalida: use 2 letras (ex.: SP, RJ) ou vazio pra limpar.'); return; }
  if (v === (profile.state || '')) return;
  if (await adminUsers({ action:'set_info', userId: profile.id, state: v }) && after) after();
};

// Edita especialidades (texto livre, separadas por virgula; vazio limpa).
const editUserSpecialties = async (profile, after) => {
  let v = prompt(
    'Especialidades de ' + (profile.name || 'este perfil') +
    '\n(separadas por virgula — ex.: Residencial, Textura, Grafiato; vazio pra limpar)',
    profile.specialties || ''
  );
  if (v === null) return;
  v = v.trim();
  if (v.length > 200) { alert('Especialidades muito longas (max 200 caracteres).'); return; }
  if (v === (profile.specialties || '')) return;
  if (await adminUsers({ action:'set_info', userId: profile.id, specialties: v }) && after) after();
};

// Edita o e-mail — TROCA O LOGIN no Auth (nao so a exibicao), por isso
// pede confirmacao. O backend recusa formato invalido e e-mail em uso.
const editUserEmail = async (profile, after) => {
  let v = prompt(
    'Novo e-mail para ' + (profile.name || 'este perfil') +
    '\n\nATENCAO: troca tambem o E-MAIL DE LOGIN da conta.',
    profile.email || ''
  );
  if (v === null) return;
  v = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { alert('E-mail invalido (esperado: nome@dominio.com).'); return; }
  if (v === (profile.email || '').toLowerCase()) return;
  if (!confirm('Confirmar a troca do e-mail de login para:\n\n' + v + '\n\nA pessoa passara a entrar com esse e-mail.')) return;
  if (await adminUsers({ action:'set_email', userId: profile.id, email: v }) && after) after();
};

// Busca o e-mail de LOGIN no Auth e espelha em profiles.email. O portal
// lista `profiles.email`, que e so um ESPELHO: perfil antigo (ou criado
// por fluxo que nao preenchia a coluna) aparece com "—" mesmo tendo login.
// A chave anon nao ve `auth.users`, entao quem busca e o servidor.
const pullUserEmail = async (profile, after) => {
  const res = await adminUsersData({ action:'sync_email', userId: profile.id });
  if (!res) return null;
  alert(
    'E-mail de login de ' + (profile.name || 'este perfil') + ':\n\n' + res.email +
    (res.source === 'profile' ? '\n\n(veio do perfil — sem login no Auth)' : '')
  );
  if (after) after();
  return res.email;
};

// Exclusao PERMANENTE (Auth + profiles). Confirmacao digitada porque nao
// tem volta. O backend bloqueia excluir a si mesmo e perfis admin/portal.
const deleteUsersPermanently = async (profiles, after) => {
  if (!profiles.length) return;
  const names = profiles.map(p => '• ' + (p.name || 'Sem nome') + (p.tag ? ' (@' + p.tag + ')' : '')).join('\n');
  // Dupla confirmacao com BOTOES (nao digitacao): no celular, digitar
  // "EXCLUIR" num prompt era erro garantido e travava o uso legitimo.
  // Dois passos ja evitam o clique acidental, que e o risco real aqui.
  if (!confirm(
    'EXCLUIR PERMANENTEMENTE ' + profiles.length + ' conta(s)?\n\n' + names +
    '\n\nApaga o LOGIN e o PERFIL do Supabase. SEM VOLTA.'
  )) return;
  if (!confirm(
    'Ultima confirmacao: ' + profiles.length + ' conta(s) serao apagadas para sempre.\n\n' +
    'Nao existe desfazer. Confirmar a exclusao?'
  )) return;
  // Conta com acesso ADMIN/PORTAL exige um TERCEIRO aceite (a pedido:
  // "habilitar para excluir aqui tbm") — a RPC so as apaga com
  // p_force_admin=true. A PROPRIA conta segue impossivel de excluir.
  const adminTargets = profiles.filter(p => p.portal_access || p.role === 'admin');
  if (adminTargets.length && !confirm(
    'ATENCAO: ' + adminTargets.length + ' conta(s) com acesso ADMIN/PORTAL:\n\n' +
    adminTargets.map(p => '• ' + (p.name || (p.tag ? '@'+p.tag : p.id.slice(0,8)))).join('\n') +
    '\n\nExcluir contas de administrador tambem?'
  )) return;
  // Exclusao via RPC admin_delete_user DIRETO no banco (Wave 43): a rota
  // do edge morria com 502 do proprio Cloudflare no meio da cascata do
  // Auth. A RPC roda a cascata inteira DENTRO do Postgres (sem HTTP pro
  // GoTrue, sem edge no caminho) e valida portal admin + guardas la.
  // Sequencial com pausa curta; falhas AGREGADAS num relatorio unico.
  let ok = 0; const failed = [];
  for (const p of profiles) {
    let msg = '';
    try {
      const { error } = await supa.rpc('admin_delete_user', {
        p_user_id: p.id,
        p_force_admin: !!(p.portal_access || p.role === 'admin')
      });
      if (error) msg = error.message || 'erro desconhecido';
    } catch (e) { msg = (e && e.message) || 'falha de rede'; }
    if (!msg) ok++;
    else failed.push('• ' + (p.name || (p.tag ? '@'+p.tag : p.id.slice(0,8))) + ' — ' + msg);
    await new Promise(res => setTimeout(res, 250));
  }
  alert(
    'Excluidas: ' + ok + ' de ' + profiles.length + ' conta(s)' +
    (failed.length
      ? '\n\nFALHARAM ' + failed.length + ':\n' + failed.slice(0, 8).join('\n') +
        (failed.length > 8 ? '\n…e mais ' + (failed.length - 8) : '')
      : '')
  );
  if (after) after();
};

// Celula de @tag com lapis de edicao — compartilhada pelas tabelas.
const TagCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span style={{ color:C.p3, fontWeight:600 }}>{profile.tag ? '@'+profile.tag : '—'}</span>
    <button onClick={() => editUserTag(profile, after)} title="Editar @tag"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);

// Nome com lapis (mesmo padrao da TagCell).
const NameCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span style={{ fontWeight:600 }}>{profile.name || 'Sem nome'}</span>
    <button onClick={() => editUserName(profile, after)} title="Editar nome"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);

// E-mail com lapis — troca tambem o LOGIN (aviso no prompt). Quando o
// espelho `profiles.email` esta vazio, o 🔄 busca o e-mail de login no
// Auth (o portal sozinho nao enxerga `auth.users`) e preenche o espelho.
const EmailCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span style={{ color:C.muted }}>{profile.email || '—'}</span>
    {!profile.email && (
      <button onClick={() => pullUserEmail(profile, after)} title="Buscar o e-mail de login no Auth"
        style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>🔄</button>
    )}
    <button onClick={() => editUserEmail(profile, after)} title="Editar e-mail (troca o login)"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);

// Cidade / UF / Especialidades com lapis (mesmo padrao).
const CityCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span>{profile.city || '—'}</span>
    <button onClick={() => editUserCity(profile, after)} title="Editar cidade"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);
const StateCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span>{profile.state || '—'}</span>
    <button onClick={() => editUserState(profile, after)} title="Editar UF"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);
const SpecialtiesCell = ({ profile, after }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
    <span style={{ color:C.muted, fontSize:12 }}>{profile.specialties || '—'}</span>
    <button onClick={() => editUserSpecialties(profile, after)} title="Editar especialidades"
      style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✏️</button>
  </span>
);

// Barra de selecao em massa (checkbox master + excluir selecionados).
const BulkDeleteBar = ({ list, selIds, setSelIds, after }) => {
  if (!selIds.length) return null;
  const chosen = list.filter(p => selIds.includes(p.id));
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, margin:'0 0 12px' }}>
      <span style={{ fontSize:13, color:C.muted }}>{selIds.length} selecionado(s)</span>
      <button onClick={() => deleteUsersPermanently(chosen, () => { setSelIds([]); if (after) after(); })}
        style={{ background:C.p4, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
        🗑 Excluir selecionados permanentemente
      </button>
      <button onClick={() => setSelIds([])}
        style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:12, color:C.muted }}>
        Limpar
      </button>
    </div>
  );
};

// Modal de data do PRO. Serve pra HABILITAR e tambem pra ALTERAR o periodo
// de quem ja e PRO — por isso recebe `current` (a expiracao que vale hoje) e
// os atalhos "+1 mes / +3 / +6 / +1 ano", que somam A PARTIR do que o cliente
// ainda tem (ou de hoje, se ja venceu). Resolve com Date ou null (cancelou).
function askProDate(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const pad = n => String(n).padStart(2, '0');
    const toISO = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
    const now = new Date();
    const cur = opts.current ? new Date(opts.current) : null;
    const curOk = !!(cur && !isNaN(cur.getTime()));
    const vigente = curOk && cur > now;
    // Base dos atalhos: a data futura que ja existe (renovacao soma em cima
    // do que sobrou) ou hoje, se venceu / nunca teve.
    const base = vigente ? new Date(cur) : new Date(now);
    const addMonths = m => { const d = new Date(base); d.setMonth(d.getMonth() + m); return d; };
    const initial = vigente ? new Date(cur) : addMonths(12);
    const tomorrow = new Date(Date.now() + 86400000);
    const ATALHOS = [['+1 mes', 1], ['+3 meses', 3], ['+6 meses', 6], ['+1 ano', 12]];
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:inherit;';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', '_proDateTitle');
    ov.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:22px;width:360px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3);">'
      + '<div id="_proDateTitle" style="font-size:16px;font-weight:800;color:' + C.ink + ';margin-bottom:4px;">' + (opts.title || 'Habilitar PRO') + '</div>'
      + '<div style="font-size:13px;color:' + C.muted + ';margin-bottom:' + (curOk ? '6' : '14') + 'px;">' + (opts.desc || 'Escolha a data de expiracao do plano PRO.') + '</div>'
      + (curOk
          ? '<div style="font-size:12px;color:' + C.muted + ';margin-bottom:14px;">Hoje ' + (vigente ? 'expira em' : 'expirou em') + ' <b style="color:' + C.ink + ';">' + cur.toLocaleDateString('pt-BR') + '</b></div>'
          : '')
      + (opts.paid
          ? '<div style="font-size:12px;color:' + C.p4 + ';margin-bottom:12px;">Atencao: assinatura paga no Mercado Pago. A proxima renovacao automatica pode sobrescrever esta data.</div>'
          : '')
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">'
      + ATALHOS.map(a => '<button type="button" class="_proQuick" data-m="' + a[1] + '" style="background:#f4f1ec;border:1px solid ' + C.border + ';color:' + C.ink + ';border-radius:999px;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600;">' + a[0] + '</button>').join('')
      + '</div>'
      + '<input id="_proDateInput" type="date" value="' + toISO(initial) + '" min="' + toISO(tomorrow) + '" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid ' + C.border + ';font-size:14px;outline:none;box-sizing:border-box;">'
      + '<div id="_proDateErr" style="color:' + C.p4 + ';font-size:12px;margin-top:8px;display:none;"></div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">'
      + '<button id="_proDateCancel" style="background:none;border:1px solid ' + C.border + ';color:' + C.ink + ';border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;">Cancelar</button>'
      + '<button id="_proDateOk" style="background:#16a34a;border:none;color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:13px;font-weight:700;">' + (opts.confirmLabel || 'Confirmar') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    const inp = ov.querySelector('#_proDateInput');
    const errEl = ov.querySelector('#_proDateErr');
    const close = val => { document.body.removeChild(ov); resolve(val); };
    setTimeout(() => inp.focus(), 30);
    // Atalhos somam sobre a base (expiracao vigente ou hoje) e so preenchem
    // o campo — quem confirma continua sendo o botao, entao da pra ajustar
    // no dedo depois de clicar em "+3 meses".
    Array.prototype.forEach.call(ov.querySelectorAll('._proQuick'), b => {
      b.onclick = () => {
        inp.value = toISO(addMonths(Number(b.getAttribute('data-m'))));
        errEl.style.display = 'none';
      };
    });
    ov.querySelector('#_proDateCancel').onclick = () => close(null);
    ov.addEventListener('click', e => { if (e.target === ov) close(null); });
    const submit = () => {
      if (!inp.value) { errEl.textContent = 'Selecione uma data.'; errEl.style.display = 'block'; return; }
      const p = inp.value.split('-');
      const exp = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 23, 59, 59);
      if (isNaN(exp.getTime()) || exp <= new Date()) { errEl.textContent = 'Informe uma data futura valida.'; errEl.style.display = 'block'; return; }
      close(exp);
    };
    ov.querySelector('#_proDateOk').onclick = submit;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(null); });
  });
}

// `opts` chega inteiro no modal (title/desc/current/paid/confirmLabel) — e
// como alterar periodo tambem e um set_pro com value=true, o mesmo caminho
// serve pra habilitar e pra editar.
const setProfilePro = async (id, value, after, opts) => {
  if (!value) {
    if (!confirm('Remover o acesso PRO deste cliente?')) return;
    if (await adminUsers({ action:'set_pro', userId:id, value:false }) && after) after();
    return;
  }
  const exp = await askProDate(opts);
  if (!exp) return;
  if (await adminUsers({ action:'set_pro', userId:id, value:true, expiresAt: exp.toISOString() }) && after) after();
};

const isProActive = p => !!(p && p.is_pro && (!p.pro_expires_at || new Date(p.pro_expires_at) > new Date()));

// Hook genérico de consulta ao Supabase: encapsula useState+useEffect+fetch.
// queryFn recebe o client `supa` e devolve o resultado bruto da query (ou
// uma Promise que resolve para `{ data, error }` / qualquer payload).
function useSupabaseQuery(queryFn, deps) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const refetch = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await queryFn(supa);
      if (res && res.error) throw res.error;
      setData(res && res.data !== undefined ? res.data : res);
    } catch (e) {
      console.warn('useSupabaseQuery:', e && e.message || e);
      setError(e);
    } finally { setLoading(false); }
  }, deps || []);
  React.useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

// Service centralizado para consultas da tabela `profiles` — evita repetir
// `supa.from('profiles').select('*')` + filtros isPro/isCliente em cada tela.
const profilesService = {
  async list(opts) {
    opts = opts || {};
    const montar = () => {
      let q = supa.from('profiles').select(opts.fields || '*');
      if (opts.portalOnly) q = q.eq('portal_access', true);
      if (opts.order) q = q.order(opts.order, { ascending: opts.ascending !== false });
      return q;
    };
    // Com limite explicito, respeita o limite. Sem ele, PAGINA — senao a
    // lista para em 1000 linhas sem avisar ninguem.
    let rows;
    if (opts.limit) {
      const { data, error } = await montar().limit(opts.limit);
      if (error) throw error;
      rows = data || [];
    } else {
      rows = await buscarTudo(montar);
    }
    if (opts.painterOnly) rows = rows.filter(isProProfile);
    if (opts.clienteOnly) rows = rows.filter(isClienteProfile);
    if (opts.proOnly) rows = rows.filter(isProActive);
    return rows;
  },
  async byId(id, fields) {
    const { data, error } = await supa.from('profiles').select(fields || '*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
};

const setProfileRole = async (id, roleKey, after) => {
  const ok = await adminUsers({ action:'set_role', userId:id, roleKey });
  if (ok && after) after();
  return ok;
};

// Deduz a opcao atual de papel a partir do profile
const currentRoleKey = p => {
  if (professionOf(p) === 'funileiro') return 'funileiro';
  const r = roleOf(p);
  if (['pintor','grafiteiro','automotivo','cliente'].includes(r)) return r;
  if (r === 'graffiti') return 'grafiteiro';
  return isProProfile(p) ? 'pintor' : 'cliente';
};

// Seletor inline para editar o tipo/papel de um perfil existente
const RoleSelect = ({ profile, after }) => {
  const [val, setVal] = useState(currentRoleKey(profile));
  const [busy, setBusy] = useState(false);
  return (
    <select value={val} disabled={busy} onChange={async e => {
      const nv = e.target.value;
      if (nv === val) return;
      const lbl = (APP_ROLE_OPTIONS.find(o => o.v === nv) || {}).label || nv;
      if (!confirm('Alterar o tipo deste perfil para "' + lbl + '"?')) { e.target.value = val; return; }
      setBusy(true);
      const ok = await setProfileRole(profile.id, nv, null);
      setBusy(false);
      if (ok) { setVal(nv); if (after) after(); } else { e.target.value = val; }
    }} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid '+C.border, fontSize:11, background:'#fff', cursor: busy?'wait':'pointer', maxWidth:160 }}>
      {APP_ROLE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
};

const Logo = () => (
  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: C.white, padding: '24px 20px 8px' }}>
    <span>Cali</span><span style={{ color: C.p1 }}>Colors</span>
    <div style={{ fontSize: 10, color: C.muted, fontWeight: 400, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Portal QueroUmaCor</div>
  </div>
);

const AvatarCell = React.memo(function AvatarCell({ name, avatarUrl, size }) {
  const s = size || 32;
  const initial = ((name || '?')[0] || '?').toUpperCase();
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={{width:s,height:s,borderRadius:'50%',objectFit:'cover'}} />;
  }
  return (
    <div style={{
      width:s, height:s, borderRadius:'50%', background:'#e8e2d9',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize: s*0.4, fontWeight:700, color:'#1a1a2e'
    }}>{initial}</div>
  );
});

const ProBadgeCell = React.memo(function ProBadgeCell({ profile, onChange }) {
  const pro = isProActive(profile);
  const paid = !!profile.mp_preapproval_id;
  if (!pro) {
    return (
      <button onClick={() => setProfilePro(profile.id, true, onChange)} style={{ padding:'4px 10px', background:'#f0f0f0', border:'1px solid #ddd', borderRadius:6, cursor:'pointer', fontSize:12 }}>
        Habilitar PRO
      </button>
    );
  }
  const exp = profile.pro_expires_at ? new Date(profile.pro_expires_at).toLocaleDateString('pt-BR') : '—';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span style={{ padding:'2px 8px', background:'#7c4dff', color:'#fff', borderRadius:20, fontSize:11, fontWeight:700 }}>
        {paid ? '💳 PRO' : '✋ PRO'}
      </span>
      <span style={{ fontSize:11, color:'#666' }}>até {exp}</span>
      <button
        onClick={() => setProfilePro(profile.id, true, onChange, {
          title: 'Alterar periodo PRO',
          desc: 'Escolha a nova data de expiracao do plano PRO.',
          confirmLabel: 'Salvar',
          current: profile.pro_expires_at,
          paid,
        })}
        title="Alterar período PRO"
        style={{ padding:'2px 6px', background:'transparent', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', fontSize:10 }}>
        ✏️
      </button>
      {!paid && (
        <button onClick={() => setProfilePro(profile.id, false, onChange)} style={{ padding:'2px 6px', background:'transparent', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', fontSize:10 }}>
          Remover
        </button>
      )}
    </span>
  );
});

const PortalAccessCell = React.memo(function PortalAccessCell({ profile, onChange }) {
  if (profile.portal_access) {
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span style={{ padding:'2px 8px', background:'#10b981', color:'#fff', borderRadius:20, fontSize:11, fontWeight:700 }}>✓ Portal</span>
        <button onClick={() => revokePortal(profile.id, onChange)} style={{ padding:'2px 6px', background:'transparent', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', fontSize:10 }}>
          Revogar
        </button>
      </span>
    );
  }
  return (
    <button onClick={() => promoteToPortal(profile.id, onChange)} style={{ padding:'4px 10px', background:'#f0f0f0', border:'1px solid #ddd', borderRadius:6, cursor:'pointer', fontSize:12 }}>
      Promover
    </button>
  );
});

const NavItem = React.memo(function NavItem({ icon, label, badge, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
      cursor: 'pointer', borderRadius: 10, margin: '2px 8px',
      background: active ? 'rgba(255,107,53,0.2)' : 'transparent',
      color: active ? C.p1 : 'rgba(255,255,255,0.7)',
      transition: 'all 0.2s'
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, flex: 1 }}>{label}</span>
      {badge > 0 && <span style={{ background: C.p4, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700 }}>{badge}</span>}
    </div>
  );
});

const KPICard = React.memo(function KPICard({ title, value, sub, trend, color }) {
  return (
    <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: C.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: color || C.p6, marginTop: 4 }}>{trend} {sub}</div>
    </div>
  );
});

const Dashboard = () => {
  const [stats, setStats] = useState({ pintores: 0, clientes: 0, leads: 0, orcamentos: 0 });
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [weeklyQuotes, setWeeklyQuotes] = useState([0,0,0,0,0,0,0]);
  const [regionData, setRegionData] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supa;
      const [profilesRes, leadsRes, quotesRes, msgsRes] = await Promise.all([
        sb.from('profiles').select('*'),
        sb.from('leads').select('id'),
        sb.from('quotes').select('id, status, created_at, client:profiles!client_id(name), painter:profiles!painter_id(name)').order('created_at', { ascending: false }).limit(50),
        sb.from('messages').select('id, content, created_at, sender_id').order('created_at', { ascending: false }).limit(5),
      ]);

      if(profilesRes.error) console.warn('Dashboard profiles error:', profilesRes.error.message);
      if(quotesRes.error) console.warn('Dashboard quotes error:', quotesRes.error.message);

      const profiles = profilesRes.data || [];
      const leads = leadsRes.data || [];
      const quotes = quotesRes.data || [];
      const msgs = msgsRes.data || [];

      const clientes = profiles.filter(isClienteProfile).length;

      setStats({ pintores: profiles.length, clientes, leads: leads.length, orcamentos: quotes.length });

      // Weekly quotes from last 7 weeks
      const now = new Date();
      const weekly = [0,0,0,0,0,0,0];
      quotes.forEach(q => {
        if (!q.created_at) return;
        const diff = Math.floor((now - new Date(q.created_at)) / (7 * 86400000));
        if (diff >= 0 && diff < 7) weekly[6 - diff]++;
      });
      setWeeklyQuotes(weekly);

      // Region distribution from profiles
      const regions = {};
      profiles.forEach(p => {
        const st = (p.state || '').toUpperCase();
        if (st === 'SP') regions['São Paulo'] = (regions['São Paulo'] || 0) + 1;
        else if (st === 'RJ') regions['Rio de Janeiro'] = (regions['Rio de Janeiro'] || 0) + 1;
        else if (['MG','PR','RS'].includes(st)) regions['MG/PR/RS'] = (regions['MG/PR/RS'] || 0) + 1;
        else regions['Outros'] = (regions['Outros'] || 0) + 1;
      });
      const total = profiles.length || 1;
      const colors = { 'São Paulo': C.p1, 'Rio de Janeiro': C.p3, 'MG/PR/RS': C.p7, 'Outros': C.muted };
      setRegionData(['São Paulo','Rio de Janeiro','MG/PR/RS','Outros'].map(r => ({
        name: r, pct: Math.round((regions[r] || 0) / total * 100) + '%', color: colors[r]
      })));

      setRecentQuotes(quotes.slice(0, 5));
      setRecentMessages(msgs);
      setLoading(false);
    })();
  }, []);

  const maxW = React.useMemo(() => Math.max(...weeklyQuotes, 1), [weeklyQuotes]);

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando dashboard...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard title="Perfis Cadastrados" value={stats.pintores.toLocaleString('pt-BR')} sub="no sistema" trend="" color={C.p6} />
        <KPICard title="Clientes" value={stats.clientes.toLocaleString('pt-BR')} sub="cadastrados" trend="" color={C.p3} />
        <KPICard title="Leads" value={stats.leads.toLocaleString('pt-BR')} sub="captados" trend="" color={C.p5} />
        <KPICard title="Orçamentos" value={stats.orcamentos.toLocaleString('pt-BR')} sub="solicitados" trend="" color={C.p1} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>📊 Orçamentos por Semana</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
            {weeklyQuotes.map((h,i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ background: i===6 ? C.p1 : C.p2, borderRadius: 4, width: '100%', height: Math.max(8, (h / maxW) * 70) + 'px' }}></div>
                <div style={{ fontSize:10, color:C.muted }}>S{i+1}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>🗺️ Perfis por Região</div>
          {regionData.map(r => (
            <div key={r.name} style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:13 }}>{r.name}</span>
              <span style={{ fontSize:13, fontWeight:700, color:r.color }}>{r.pct}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>📋 Orçamentos Recentes</div>
        {recentQuotes.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum orçamento encontrado.</div>}
        {recentQuotes.map((q,i) => {
          const stInfo = quoteStatusInfo(q.status);
          const stStyle = quoteStatusStyle(q.status);
          const data = q.created_at ? new Date(q.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '—';
          return (
            <div key={q.id || i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i < recentQuotes.length - 1 ? '1px solid ' + C.border : 'none' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:C.p2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700 }}>
                {(q.client?.name || '?')[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{q.client?.name || '—'}</span>
                  <span style={{ color:C.muted, fontSize:12 }}>→</span>
                  <span style={{ fontSize:13 }}>{q.painter?.name || '—'}</span>
                  <span style={{ ...stStyle, fontSize:10, padding:'1px 8px', borderRadius:6 }}>{stInfo.label}</span>
                </div>
              </div>
              <div style={{ fontSize:11, color:C.muted }}>{data}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PintoresList = ({ roleFilter, title, defaultRole, emptyMsg }) => {
  // Mostra TODOS os profissionais do tipo, sendo PRO ou nao.
  const { data, loading, refetch: fetchPintores } = useSupabaseQuery(() => profilesService
    .list({ painterOnly: true, order: 'created_at', ascending: false }), []);
  const pintores = roleFilter ? (data || []).filter(roleFilter) : (data || []);
  const [selIds, setSelIds] = useState([]);
  const toggleSel = (id) => setSelIds(s => s.includes(id) ? s.filter(x => x !== id) : s.concat(id));
  const allSel = pintores.length > 0 && selIds.length === pintores.length;

  const updateVerified = (id, verified) => setProfileVerified(id, verified, fetchPintores);

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando...</div>;

  return (
    <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>{title || 'Pintores Cadastrados'} ({pintores.length})</div>
      <CreateAppUserForm onCreated={fetchPintores} defaultRole={defaultRole || 'pintor'} />
      <BulkDeleteBar list={pintores} selIds={selIds} setSelIds={setSelIds} after={fetchPintores} />
      {pintores.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>{emptyMsg || 'Nenhum pintor cadastrado.'}</div>}
      <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:700 }}>
        {pintores.length > 0 && (
          <thead>
            <tr style={{ borderBottom:'2px solid '+C.border }}>
              <th style={{ padding:'8px 12px', width:34 }}>
                <input type="checkbox" checked={allSel} onChange={e => setSelIds(e.target.checked ? pintores.map(x => x.id) : [])} title="Selecionar todos" />
              </th>
              {['Nome','Email','Tipo','Tag','Cidade','Estado','Especialidades','Avaliacao','Status','PRO','Portal','Acoes'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {pintores.map((p, i) => (
            <tr key={p.id} style={{ borderBottom:'1px solid '+C.border, background: selIds.includes(p.id) ? C.cream : 'transparent' }}>
              <td style={{ padding:'10px 12px' }}>
                <input type="checkbox" checked={selIds.includes(p.id)} onChange={() => toggleSel(p.id)} />
              </td>
              <td style={{ padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <AvatarCell name={p.name} avatarUrl={p.avatar_url} size={32} />
                  <NameCell profile={p} after={fetchPintores} />
                </div>
              </td>
              <td style={{ padding:'10px 12px', fontSize:12 }}><EmailCell profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px' }}><RoleSelect profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px', fontSize:12 }}><TagCell profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px' }}><CityCell profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px' }}><StateCell profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px' }}><SpecialtiesCell profile={p} after={fetchPintores} /></td>
              <td style={{ padding:'10px 12px' }}>{p.rating_avg != null ? Number(p.rating_avg).toFixed(1) : '—'}</td>
              <td style={{ padding:'10px 12px' }}>
                {p.verified ? <span style={{ background:C.p6+'22', color:C.p6, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>Aprovado</span> : <span style={{ background:C.p7+'22', color:'#b8860b', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>Pendente</span>}
              </td>
              <td style={{ padding:'10px 12px' }}>
                <ProBadgeCell profile={p} onChange={fetchPintores} />
              </td>
              <td style={{ padding:'10px 12px' }}>
                <PortalAccessCell profile={p} onChange={fetchPintores} />
              </td>
              <td style={{ padding:'10px 12px' }}>
                <div style={{ display:'flex', gap:6 }}>
                  {!p.verified ? (
                    <>
                      <button onClick={() => updateVerified(p.id, true)} style={{ background:C.p6, color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:600 }}>Aprovar</button>
                      <button onClick={() => updateVerified(p.id, false)} style={{ background:C.p4, color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:600 }}>Rejeitar</button>
                    </>
                  ) : (
                    <button onClick={() => updateVerified(p.id, false)} style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, color:C.muted }}>Revogar</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

// Dicionário determinístico: cor escrita no nome → hex. Compostos primeiro.
// Movido para escopo de módulo: nunca muda e era recriado a cada render.
const COLOR_DICT = [
  ['branco neve','#fbfbf7'],['branco gelo','#eef0ea'],['branco fosco','#f4f3ee'],['off white','#efece1'],['branco','#f6f5f0'],
  ['preto fosco','#1c1c1c'],['preto','#1a1a1a'],
  ['cinza chumbo','#4b4f54'],['cinza grafite','#3a3d40'],['grafite','#3a3d40'],['cinza claro','#c7c9c8'],['cinza escuro','#5a5d5f'],['cinza concreto','#9a9b96'],['concreto','#9a9b96'],['cinza','#9b9d9c'],['prata','#c5c7c9'],['aluminio','#b8bcc0'],
  ['azul claro','#9ec7e8'],['azul bebe','#bcd9ee'],['azul royal','#1f4ea1'],['azul marinho','#1b2a4a'],['azul petroleo','#1f5560'],['azul turquesa','#2bb6c4'],['turquesa','#2bb6c4'],['azul','#2f6fb0'],
  ['verde musgo','#5a6b3b'],['verde limao','#bcd64a'],['verde agua','#bfe3d8'],['verde bandeira','#1e7a3d'],['verde oliva','#6b6b3a'],['verde','#2e8b57'],
  ['amarelo ouro','#e0a526'],['amarelo canario','#f5d427'],['amarelo','#f2c531'],['ouro','#caa233'],['dourado','#caa233'],
  ['vermelho','#c0392b'],['vinho','#5e1f24'],['bordo','#5e1f24'],['carmim','#9b1c2e'],
  ['laranja','#e67e22'],['terracota','#b5562e'],['tijolo','#9c4a2f'],['salmao','#f0a78f'],
  ['rosa','#e79bb3'],['pink','#e84d8a'],['magenta','#c0337a'],
  ['roxo','#6b3fa0'],['lilas','#b9a5d6'],['violeta','#7a4fb0'],
  ['marrom','#6b4226'],['cafe','#4b3621'],['chocolate','#4b2e1e'],['caramelo','#a9743b'],['tabaco','#7a5230'],['imbuia','#5a3a22'],['mogno','#6e3326'],['cedro','#8a5a33'],['castanho','#5d3a22'],
  ['bege','#d8c6a8'],['areia','#d6c5a0'],['palha','#e3d5ad'],['creme','#efe6cf'],['nude','#e3c9b3'],['camurca','#c9a878'],['marfim','#efe7d2'],
  ['gelo','#eef0ea'],['perola','#ece7dd'],
];
const _PLACEHOLDER_HEX = /^#?(c0622d|cccccc|ddd|dddddd|e8e2d9)$/i;
const resolveColorHex = (p) => {
  const ch = p && p.color_hex ? String(p.color_hex).trim() : '';
  if(ch && !_PLACEHOLDER_HEX.test(ch.replace('#',''))) return ch;
  const n = ' ' + String(p && p.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') + ' ';
  for(const [k,hex] of COLOR_DICT){ if(n.includes(k)) return hex; }
  return ch || null;
};
const productBg = (p) => p && p.color_gradient ? 'linear-gradient(135deg,'+p.color_gradient+')' : (resolveColorHex(p) || '#e8e2d9');

// Classificador automático por palavra-chave no nome (marca/tipo).
// A ordem importa: o primeiro menu cuja palavra-chave casar vence.
const MENUS = [
  { key:'arte_urbana',  label:'🎨 Arte Urbana & Spray',     kw:['arte urbana','colorgin','spray','aerossol','aerosol','grafit','graffit'] },
  { key:'tintas',       label:'🪣 Tintas',                   kw:['tinta','esmalte','latex','látex','acrilic','acrílic','verniz','primer','seladora','fundo preparador','base coat','automotiva','suvinil','coral','sherwin'] },
  { key:'texturas',     label:'🧱 Texturas & Massas',        kw:['textura','grafiato','massa corrida','massa acrilic','massa pva','reboco','chapisco'] },
  { key:'epoxi',        label:'⚗️ Epóxi & Poliuretano',      kw:['epoxi','epóxi','poliuretano',' pu '] },
  { key:'solventes',    label:'💧 Solventes & Aditivos',     kw:['thinner','solvente','diluente','aguarras','aguarrás','acelerador','secante','catalisador','endurecedor','aditivo','redutor','removedor'] },
  { key:'adesivos',     label:'🧪 Adesivos & Colas',         kw:['adesivo','cola','silicone','vedante','veda calha','rejunte','massa epox','durepoxi'] },
  { key:'ferramentas',  label:'🧰 Ferramentas',              kw:['alicate','tesoura','chave','martelo','abre trinca','espatula','espátula','desempenadeira','colher de pedreiro','trena','serra','furadeira','broca','lixadeira','estilete','formao','formão','grosa','lima','torques'] },
  { key:'pintura',      label:'🖌️ Acessórios de Pintura',    kw:['rolo','pincel','trincha','bandeja','fita crepe','fita','lixa','cabo extensor','extensor','gaiola','luva','mascara','máscara','respirador','oculos','óculos','lona','plastico','plástico','crepe'] },
  { key:'eletrica',     label:'🔌 Elétrica',                 kw:['tomada','adaptador','extens','lampada','lâmpada','disjuntor','filtro de linha','benjamim','fio ','interruptor'] },
  { key:'equipamentos', label:'🛠️ Equipamentos',             kw:['aerografo','aerógrafo','compressor','pistola','maquina','máquina','pulverizador','airless'] },
];
const classify = (p) => {
  const n = (' ' + (p.name||'') + ' ').toLowerCase();
  for(const m of MENUS){ if(m.kw.some(k => n.includes(k))) return m.key; }
  return 'outros';
};
const MENU_LABEL = Object.fromEntries(MENUS.map(m => [m.key, m.label]).concat([['outros','📦 Outros']]));

const ProdutosList = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [menuFilter, setMenuFilter] = useState('all');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState({ name:'', code:'', category:'tintas', volume:'18L', price:'', color_hex:'#c0622d', color_gradient:'', image_url:'', stock:0, badge:'', description:'', line:'Linha Premium', rendimento:'~10m²/L', demaos:'2', secagem:'2h', active:true });

  const loadProducts = async () => {
    setLoading(true);
    try {
      const PAGE = 1000;
      const byId = new Map();
      for(let pageNo = 0; pageNo < 30; pageNo++){
        const from = pageNo * PAGE;
        const { data, error } = await supa.from('products').select('*').order('name').range(from, from + PAGE - 1);
        if(error) throw error;
        if(!data || data.length === 0) break;
        const before = byId.size;
        data.forEach(p => { byId.set(p.id, p); });
        if(byId.size === before) break;
        if(data.length < PAGE) break;
      }
      setProducts(Array.from(byId.values()));
    } catch(e) {
      console.error('loadProducts error:', e);
      setProducts([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadProducts(); }, []);

  const saveProduct = async () => {
    try {
      const productData = { ...form, price: parseFloat(String(form.price).replace(',','.')) || 0, stock: parseInt(form.stock) || 0 };
      if(!productData.image_url) delete productData.image_url; // só envia se houver foto (coluna pode não existir ainda)
      if(!productData.name) { alert('Nome obrigatorio'); return; }
      // productsService.upsert cobre insert + update (quando id presente).
      if(editing) productData.id = editing;
      await productsService.upsert(productData);
      setShowForm(false); setEditing(null);
      setForm({ name:'', code:'', category:'tintas', volume:'18L', price:'', color_hex:'#c0622d', color_gradient:'', image_url:'', stock:0, badge:'', description:'', line:'Linha Premium', rendimento:'~10m²/L', demaos:'2', secagem:'2h', active:true });
      loadProducts();
    } catch(e) { alert('Erro: ' + (e.message || e)); }
  };

  const deleteProduct = async (id) => {
    if(!confirm('Excluir este produto?')) return;
    try {
      await productsService.remove(id);
      loadProducts();
    } catch(e) { alert('Erro: ' + (e.message || e)); }
  };

  const editProduct = (p) => {
    setForm({ name:p.name||'', code:p.code||'', category:p.category||'tintas', volume:p.volume||'18L', price:p.price||'', color_hex:p.color_hex||'#c0622d', color_gradient:p.color_gradient||'', image_url:p.image_url||'', stock:p.stock||0, badge:p.badge||'', description:p.description||'', line:p.line||'', rendimento:p.rendimento||'', demaos:p.demaos||'', secagem:p.secagem||'', active:p.active!==false });
    setEditing(p.id);
    setShowForm(true);
  };

  // Agrupamento por categoria — pesado quando há milhares de produtos.
  // Só recalcula quando a lista de produtos muda (não a cada keystroke da busca).
  const grouped = React.useMemo(() => {
    const g = {};
    products.forEach(p => { const k = classify(p); if(!g[k]) g[k] = []; g[k].push(p); });
    return g;
  }, [products]);
  const orderedKeys = React.useMemo(
    () => MENUS.map(m=>m.key).concat(['outros']).filter(k => grouped[k] && grouped[k].length),
    [grouped]
  );
  const totalItens = products.length;
  const qLower = React.useMemo(() => busca.trim().toLowerCase(), [busca]);

  const inputStyle = { width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid '+C.border, fontSize:13, outline:'none' };
  const labelStyle = { fontSize:12, color:C.muted, marginBottom:4, display:'block' };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  // Esc fecha a gaveta — o formulário é modal-ish (fica por cima da lista),
  // então a saída pelo teclado tem que existir.
  useEffect(() => {
    if(!showForm) return;
    const onKey = e => { if(e.key === 'Escape') closeForm(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  // Largura da gaveta. A lista ganha esse respiro à direita enquanto ela
  // está aberta, pra nenhum card de produto ficar escondido embaixo.
  const DRAWER_W = 460;

  return (
    // `paddingRight` empurra a lista enquanto a gaveta está aberta: sem isso
    // a última coluna de produtos fica atrás dela.
    <div style={{ paddingRight: showForm ? DRAWER_W + 24 : 0, transition:'padding-right .2s ease' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontWeight:700, color:C.ink, fontSize:18 }}>🎨 Produtos / Tintas</div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={()=>{ setEditing(null); setForm({ name:'', code:'', category:'tintas', volume:'18L', price:'', color_hex:'#c0622d', color_gradient:'', image_url:'', stock:0, badge:'', description:'', line:'Linha Premium', rendimento:'~10m²/L', demaos:'2', secagem:'2h', active:true }); setShowForm(true); }} style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer' }}>+ Novo Produto</button>
        </div>
      </div>

      {showForm && (
        <div style={{ position:'fixed', top:0, right:0, bottom:0, width:DRAWER_W, maxWidth:'100%', background:C.white, boxShadow:'-10px 0 34px rgba(0,0,0,.16)', borderLeft:'3px solid '+C.p1, zIndex:900, display:'flex', flexDirection:'column', animation:'drawerIn .22s cubic-bezier(.32,.72,0,1)' }}>
          {/* Cabeçalho fixo: o título e o X não somem quando o formulário
              rola. Antes o formulário era um card no TOPO da página — ao
              descer pra procurar a cor na lista, ele sumia de vista. */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'16px 20px', borderBottom:'1px solid '+C.border, flexShrink:0 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>{editing ? 'Editar Produto' : 'Novo Produto'}</div>
            <button onClick={closeForm} aria-label="Fechar" title="Fechar (Esc)" style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(0,0,0,.06)', color:C.ink, fontSize:20, lineHeight:1, cursor:'pointer' }}>×</button>
          </div>
          {/* Corpo rolável — só os campos rolam. */}
          <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div><label style={labelStyle}>Nome *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inputStyle} placeholder="Terracota Premium" /></div>
            <div><label style={labelStyle}>Código</label><input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} style={inputStyle} placeholder="CC-TT-001" /></div>
            <div><label style={labelStyle}>Categoria</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}><option value="tintas">Tintas</option><option value="texturas">Texturas</option><option value="epoxi">Epóxi</option><option value="acessorios">Acessórios</option></select></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div><label style={labelStyle}>Volume</label><input value={form.volume} onChange={e=>setForm({...form,volume:e.target.value})} style={inputStyle} placeholder="18L" /></div>
            <div><label style={labelStyle}>Preço (R$)</label><input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} style={inputStyle} placeholder="289.00" /></div>
            <div><label style={labelStyle}>Estoque</label><input type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} style={inputStyle} /></div>
            <div><label style={labelStyle}>Badge</label><input value={form.badge} onChange={e=>setForm({...form,badge:e.target.value})} style={inputStyle} placeholder="-10%, NOVO" /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div><label style={labelStyle}>Cor (hex)</label><div style={{ display:'flex', gap:6 }}><input type="color" value={form.color_hex} onChange={e=>setForm({...form,color_hex:e.target.value})} style={{ width:40, height:34, border:'none', cursor:'pointer' }} /><input value={form.color_hex} onChange={e=>setForm({...form,color_hex:e.target.value})} style={{...inputStyle, flex:1}} /></div></div>
            <div><label style={labelStyle}>Gradiente (opcional)</label><input value={form.color_gradient} onChange={e=>setForm({...form,color_gradient:e.target.value})} style={inputStyle} placeholder="#c4956a,#d4a870" /></div>
            <div><label style={labelStyle}>Linha</label><input value={form.line} onChange={e=>setForm({...form,line:e.target.value})} style={inputStyle} placeholder="Linha Premium" /></div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labelStyle}>Foto do produto (opcional — sobrepõe a cor)</label>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {form.image_url && <div style={{ width:48, height:48, borderRadius:8, background:'center/cover no-repeat url('+form.image_url+')', border:'1px solid '+C.border, flexShrink:0 }}></div>}
              <input type="file" accept="image/*" disabled={fotoBusy} onChange={async e=>{
                const f = e.target.files && e.target.files[0];
                e.target.value = '';
                if(!f) return;
                if(!f.type.startsWith('image/')){ alert('Selecione um arquivo de imagem.'); return; }
                if(f.size > 5 * 1024 * 1024){ alert('Imagem grande demais (max 5MB).'); return; }
                setFotoBusy(true);
                try {
                  const { data: { user } } = await supa.auth.getUser();
                  if(!user) throw new Error('Sessao expirada — entre de novo.');
                  // O bucket `posts` exige que o path COMECE no id de quem
                  // sobe (Wave 27, path validation). O caminho antigo era
                  // 'products/...' — a RLS recusava. Isso nunca apareceu
                  // porque o `setAiBusy` inexistente estourava antes.
                  const nome = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                  const path = user.id + '/products/' + Date.now() + '-' + nome;
                  const { error } = await supa.storage.from('posts')
                    .upload(path, f, { upsert:true, contentType: f.type });
                  if(error) throw error;
                  const { data } = supa.storage.from('posts').getPublicUrl(path);
                  setForm(fm => ({ ...fm, image_url: (data && data.publicUrl) || '' }));
                } catch(err){ alert('Erro ao enviar foto: ' + (err.message||err)); }
                setFotoBusy(false);
              }} style={{ fontSize:12, flex:1 }} />
              {fotoBusy ? <span style={{ fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>Enviando…</span> : null}
              {form.image_url && <button type="button" onClick={()=>setForm({...form,image_url:''})} style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', color:C.muted }}>Remover</button>}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div><label style={labelStyle}>Rendimento</label><input value={form.rendimento} onChange={e=>setForm({...form,rendimento:e.target.value})} style={inputStyle} placeholder="~10m²/L" /></div>
            <div><label style={labelStyle}>Demãos</label><input value={form.demaos} onChange={e=>setForm({...form,demaos:e.target.value})} style={inputStyle} placeholder="2" /></div>
            <div><label style={labelStyle}>Secagem</label><input value={form.secagem} onChange={e=>setForm({...form,secagem:e.target.value})} style={inputStyle} placeholder="2h" /></div>
          </div>
          <div style={{ marginBottom:12 }}><label style={labelStyle}>Descrição</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...inputStyle, minHeight:60}} placeholder="Tinta premium com acabamento fosco..." /></div>
          </div>
          {/* Rodapé fixo: Salvar sempre ao alcance, sem rolar até o fim. */}
          <div style={{ display:'flex', gap:10, alignItems:'center', padding:'14px 20px', borderTop:'1px solid '+C.border, background:C.white, flexShrink:0 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})} /> Ativo</label>
            <div style={{ flex:1 }}></div>
            <button onClick={closeForm} style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'8px 18px', fontSize:13, cursor:'pointer', color:C.muted }}>Cancelar</button>
            <button onClick={saveProduct} style={{ background:C.p1, color:'#fff', border:'none', borderRadius:8, padding:'8px 24px', fontSize:13, fontWeight:700, cursor:'pointer' }}>{editing ? 'Salvar' : 'Criar Produto'}</button>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div style={{ marginBottom:18 }}>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔎 Buscar produto..." style={{...inputStyle, marginBottom:12}} />
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            <button onClick={()=>setMenuFilter('all')} style={{ border:'1px solid '+(menuFilter==='all'?C.p1:C.border), background:menuFilter==='all'?C.p1:'transparent', color:menuFilter==='all'?'#fff':C.ink, borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Todos <b>({totalItens})</b></button>
            {orderedKeys.map(k => (
              <button key={k} onClick={()=>setMenuFilter(k)} style={{ border:'1px solid '+(menuFilter===k?C.p1:C.border), background:menuFilter===k?C.p1:'transparent', color:menuFilter===k?'#fff':C.ink, borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>{MENU_LABEL[k]} <b>({grouped[k].length})</b></button>
            ))}
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign:'center', padding:40, color:C.muted }}>Carregando produtos...</div> :
       products.length === 0 ? <div style={{ textAlign:'center', padding:40, color:C.muted }}>Nenhum produto cadastrado. Clique em "+ Novo Produto" para começar.</div> :
       orderedKeys.filter(cat => menuFilter==='all' || menuFilter===cat).map(cat => {
        const items = grouped[cat].filter(p => !qLower || (p.name||'').toLowerCase().includes(qLower) || (p.code||'').toLowerCase().includes(qLower));
        if(items.length === 0) return null;
        return (
        <div key={cat} style={{ marginBottom:24 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.muted, marginBottom:10, textTransform:'uppercase', letterSpacing:.5 }}>{MENU_LABEL[cat] || cat} <span style={{ color:C.p1 }}>({grouped[cat].length})</span></div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            {items.map(p => {
              const bg = p.image_url ? 'center/cover no-repeat url('+p.image_url+')' : productBg(p);
              return (
                <div key={p.id} style={{ background:C.white, borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', opacity:p.active===false?0.5:1, position:'relative' }}>
                  {p.badge && <div style={{ position:'absolute', top:8, left:8, background:p.badge==='NOVO'?C.p1:'#e63946', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, zIndex:1 }}>{p.badge}</div>}
                  <div style={{ width:'100%', height:60, borderRadius:8, background:bg, marginBottom:12 }}></div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{p.code}{p.code && p.volume ? ' · ' : ''}{p.volume}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                    <div style={{ fontWeight:700, color:C.p1 }}>R$ {Number(p.price||0).toFixed(2).replace('.',',')}</div>
                    <div style={{ fontSize:11, color:p.stock<=5?'#e63946':'#2e7d32' }}>{p.stock} unid</div>
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:10 }}>
                    <button onClick={()=>editProduct(p)} style={{ flex:1, background:C.cream, border:'none', borderRadius:8, padding:'6px', fontSize:12, cursor:'pointer', fontWeight:600, color:C.ink }}>Editar</button>
                    <button aria-label="Excluir produto" onClick={()=>deleteProduct(p.id)} style={{ background:'none', border:'1px solid #e6394644', borderRadius:8, padding:'6px 10px', fontSize:12, cursor:'pointer', color:'#e63946' }}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
};

// ══ CAMISETAS PERSONALIZADAS ══
// Duas partes: o configurador (cor/tamanho/logo) e a galeria de logos que os
// pintores geraram/enviaram DENTRO DO APP (tabela `brand_logos`, Wave 37).
// A galeria é o motivo da tela existir: sem ela a loja recebia um pedido de
// camiseta sem saber qual arte estampar nem de quem era.

const LOGO_SOURCE_LABELS = { ai: '🤖 Gerado com IA', upload: '📤 Enviado pelo pintor' };
const LOGO_SOURCE_COLORS = { ai: '#8338ec', upload: '#2ec4b6' };

// Busca em 2 passos (mesma razão de PedidosLoja): o embed PostgREST quebra a
// query inteira se a FK não estiver do jeito que ele espera, e aí a tela
// aparece vazia sem dizer por quê. RLS (brand_logos_select_admin =
// is_portal_admin) é quem libera ver o de todo mundo.
const useBrandLogos = () => useSupabaseQuery(async (sb) => {
  const { data: rows, error } = await sb
    .from('brand_logos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return { error };
  const list = rows || [];
  const userIds = [...new Set(list.map(l => l.user_id).filter(Boolean))];
  const pmap = {};
  if (userIds.length) {
    const { data: profs } = await sb
      .from('profiles')
      .select('id, name, tag, phone, city, state, role, avatar_url, business_name, business_logo_url')
      .in('id', userIds);
    (profs || []).forEach(pr => { pmap[pr.id] = pr; });
  }
  return { data: list.map(l => ({ ...l, painter: pmap[l.user_id] || null })) };
}, []);

const LogoCard = React.memo(function LogoCard({ item, onUse }) {
  const p = item.painter || {};
  const isCurrent = !!p.business_logo_url && p.business_logo_url === item.image_url;
  const when = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '—';
  const wa = (p.phone || '').replace(/\D/g, '');
  return (
    <div style={{ background:C.white, border:'1px solid '+C.border, borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative', background:C.cream, height:150, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <img src={item.image_url} alt={item.prompt_name || 'Logo'} loading="lazy" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
        <span style={{ position:'absolute', top:6, left:6, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, color:'#fff', background: LOGO_SOURCE_COLORS[item.source] || C.muted }}>
          {LOGO_SOURCE_LABELS[item.source] || item.source}
        </span>
        {isCurrent && (
          <span style={{ position:'absolute', top:6, right:6, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, color:'#fff', background:C.p1 }}>★ logo atual</span>
        )}
      </div>
      <div style={{ padding:10, display:'flex', flexDirection:'column', gap:6, flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <AvatarCell name={p.name} avatarUrl={p.avatar_url} size={28} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:13, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {p.name || 'Pintor sem nome'}
            </div>
            <div style={{ fontSize:11, color:C.muted }}>
              {p.tag ? '@' + p.tag : '—'}{p.role ? ' · ' + p.role : ''}
            </div>
          </div>
        </div>
        {p.business_name && <div style={{ fontSize:11, color:C.ink }}>🏷️ {p.business_name}</div>}
        <div style={{ fontSize:11, color:C.muted }}>
          {(p.city || '—')}{p.state ? '/' + p.state : ''} · {p.phone || 'sem telefone'}
        </div>
        {item.prompt_name && (
          <div style={{ fontSize:11, color:C.ink, background:C.cream, borderRadius:8, padding:'6px 8px' }}>
            <b>{item.prompt_name}</b>{item.prompt_style ? ' · ' + item.prompt_style : ''}
          </div>
        )}
        <div style={{ fontSize:10, color:C.muted }}>Gerado em {when}</div>
        <div style={{ display:'flex', gap:6, marginTop:'auto' }}>
          <button onClick={() => onUse(item)} style={{ flex:1, background:C.p1, color:'#fff', border:'none', borderRadius:8, padding:'6px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Usar na camiseta
          </button>
          <a href={item.image_url} target="_blank" rel="noopener noreferrer" style={{ background:C.cream, color:C.ink, borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:600, textDecoration:'none' }}>
            Abrir
          </a>
          {wa && (
            <a href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer" title="Falar com o pintor" style={{ background:'#25d366', color:'#fff', borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:600, textDecoration:'none' }}>
              💬
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

const Camisetas = () => {
  const [cor, setCor] = useState('#1a1a2e');
  const [tam, setTam] = useState('M');
  const [logo, setLogo] = useState(true);
  // Logo escolhido na galeria — entra no mockup e no texto do pedido.
  const [logoSel, setLogoSel] = useState(null);
  const [busca, setBusca] = useState('');
  const [fonte, setFonte] = useState('todos');
  const { data, loading, error, refetch } = useBrandLogos();
  const logos = data || [];

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return logos.filter(l => {
      if (fonte !== 'todos' && l.source !== fonte) return false;
      if (!q) return true;
      const p = l.painter || {};
      return [p.name, p.tag, p.business_name, p.city, l.prompt_name, l.prompt_style]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [logos, busca, fonte]);

  const painterName = logoSel && logoSel.painter
    ? (logoSel.painter.business_name || logoSel.painter.name || '')
    : '';

  const gerarPedido = () => {
    if (!logoSel) {
      alert('Escolha primeiro o logo de um pintor na galeria abaixo.');
      return;
    }
    const p = logoSel.painter || {};
    alert(
      'Pedido de camiseta\n\n' +
      'Pintor: ' + (p.name || '—') + (p.tag ? ' (@' + p.tag + ')' : '') + '\n' +
      'Contato: ' + (p.phone || '—') + '\n' +
      'Cor: ' + cor + ' · Tamanho: ' + tam + '\n' +
      'Logo Cali Colors: ' + (logo ? 'sim' : 'nao') + '\n' +
      'Arte: ' + logoSel.image_url
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:700, marginBottom:16, color:C.ink }}>👕 Configurador de Camisetas</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
          <div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:8 }}>Cor da Camiseta</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['#1a1a2e','#ff6b35','#2ec4b6','#e63946','#ffffff','#4a4a4a'].map(c => (
                <div key={c} onClick={() => setCor(c)} style={{ width:32, height:32, borderRadius:'50%', background:c, border: cor===c ? '3px solid '+C.p1 : '2px solid '+C.border, cursor:'pointer' }}></div>
              ))}
            </div>
            <div style={{ fontSize:13, color:C.muted, marginTop:16, marginBottom:8 }}>Tamanho</div>
            <div style={{ display:'flex', gap:8 }}>
              {['P','M','G','GG'].map(t => (
                <button key={t} onClick={() => setTam(t)} style={{ padding:'6px 16px', borderRadius:8, border:'2px solid '+(tam===t?C.p1:C.border), background:tam===t?C.p1:'transparent', color:tam===t?'#fff':C.ink, cursor:'pointer', fontWeight:600 }}>{t}</button>
              ))}
            </div>
            <div style={{ fontSize:13, color:C.muted, marginTop:16, marginBottom:8 }}>Logo</div>
            <div style={{ display:'flex', gap:12 }}>
              <label style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={logo} onChange={e => setLogo(e.target.checked)} />
                <span style={{ fontSize:13 }}>Cali Colors + Nome Pintor</span>
              </label>
            </div>
            <div style={{ fontSize:13, color:C.muted, marginTop:16, marginBottom:8 }}>Arte do pintor</div>
            {logoSel ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, background:C.cream, borderRadius:10, padding:8 }}>
                <img src={logoSel.image_url} alt="" style={{ width:40, height:40, objectFit:'contain' }} />
                <div style={{ fontSize:12, color:C.ink, flex:1 }}>
                  <div style={{ fontWeight:700 }}>{painterName || 'Pintor'}</div>
                  <div style={{ color:C.muted }}>{logoSel.prompt_name || (LOGO_SOURCE_LABELS[logoSel.source] || '')}</div>
                </div>
                <button onClick={() => setLogoSel(null)} aria-label="Tirar logo" style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'4px 8px', cursor:'pointer', color:C.ink }}>×</button>
              </div>
            ) : (
              <div style={{ fontSize:12, color:C.muted }}>Escolha um logo na galeria abaixo.</div>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            {/* Mockup IGUAL ao do app (ShirtCustomizer): foto /img/shirt-white.webp
                + overlay multiply mascarado pela própria foto pra tingir a cor +
                logo do pintor no peito esquerdo (30%/22%/14%) e Cali Colors no
                direito. Antes era um retângulo colorido que não parecia camiseta. */}
            <div style={{ position:'relative', width:240, height:240 }}>
              <img src="/img/shirt-white.webp" alt="Camiseta" style={{ position:'absolute', left:0, top:0, width:'100%', height:'100%', objectFit:'contain', filter:'drop-shadow(0 6px 12px rgba(0,0,0,0.08))' }} />
              {cor !== '#ffffff' && (
                <div style={{ position:'absolute', left:0, top:0, width:'100%', height:'100%', background:cor, mixBlendMode:'multiply', WebkitMaskImage:'url(/img/shirt-white.webp)', WebkitMaskRepeat:'no-repeat', WebkitMaskPosition:'center', WebkitMaskSize:'contain', maskImage:'url(/img/shirt-white.webp)', maskRepeat:'no-repeat', maskPosition:'center', maskSize:'contain', opacity:0.85 }}></div>
              )}
              {logoSel ? (
                <img src={logoSel.image_url} alt="" style={{ position:'absolute', left:'30%', top:'22%', width:'14%', maxHeight:'14%', objectFit:'contain', borderRadius:3 }} />
              ) : (
                <div style={{ position:'absolute', left:'28%', top:'21%', width:'18%', height:'15%', border:'1.5px dashed rgba(0,0,0,0.3)', borderRadius:5, fontSize:7, color:'rgba(0,0,0,0.5)', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', lineHeight:1.1, padding:2, textTransform:'uppercase', letterSpacing:'0.3px', background:'rgba(255,255,255,0.4)' }}>Aplique seu logo</div>
              )}
              {logo && <img src="/img/cali-colors-logo.webp" alt="Cali Colors" style={{ position:'absolute', right:'30%', top:'22%', width:'14%', maxHeight:'14%', objectFit:'contain' }} />}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
              TAM {tam}{painterName ? ' · ' + painterName.slice(0, 18) : ''}
            </div>
            <button onClick={gerarPedido} style={{ marginTop:12, background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', cursor:'pointer', fontWeight:600 }}>
              Gerar Pedido
            </button>
          </div>
        </div>
      </div>

      {/* Galeria — tudo que os pintores geraram/enviaram no app */}
      <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:12 }}>
          <div>
            <div style={{ fontWeight:700, color:C.ink }}>🎨 Logos dos pintores ({filtrados.length})</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
              Tudo que foi gerado com o Seu Zé ou enviado pelo pintor dentro do app fica salvo aqui.
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por pintor, @tag, cidade, texto do logo…"
              style={{ padding:'8px 12px', border:'1px solid '+C.border, borderRadius:8, fontSize:13, minWidth:260 }}
            />
            <select value={fonte} onChange={e => setFonte(e.target.value)} style={{ padding:'8px 10px', border:'1px solid '+C.border, borderRadius:8, fontSize:13, background:C.white, color:C.ink }}>
              <option value="todos">Todos</option>
              <option value="ai">Gerados com IA</option>
              <option value="upload">Enviados</option>
            </select>
            <button onClick={refetch} style={{ padding:'8px 12px', border:'1px solid '+C.border, background:C.cream, borderRadius:8, fontSize:13, cursor:'pointer', color:C.ink, fontWeight:600 }}>
              Atualizar
            </button>
          </div>
        </div>

        {loading && <div style={{ color:C.muted, fontSize:13, padding:'24px 0' }}>Carregando logos…</div>}
        {!loading && error && (
          <div style={{ color:C.p4, fontSize:13, padding:'24px 0' }}>
            Não foi possível carregar os logos: {error.message || String(error)}
          </div>
        )}
        {!loading && !error && filtrados.length === 0 && (
          <div style={{ color:C.muted, fontSize:13, padding:'24px 0' }}>
            {logos.length === 0
              ? 'Nenhum logo ainda. Assim que um pintor gerar ou enviar um logo no app, ele aparece aqui.'
              : 'Nenhum logo bate com o filtro.'}
          </div>
        )}
        {!loading && !error && filtrados.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(230px, 1fr))', gap:12 }}>
            {filtrados.map(item => (
              <LogoCard key={item.id} item={item} onUse={setLogoSel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Analytics = () => {
  const [data, setData] = useState({ profiles: 0, leads: 0, quotes: 0, messages: 0, quotesAccepted: 0, quotesData: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supa;
      const [pRes, lRes, qRes, mRes] = await Promise.all([
        sb.from('profiles').select('id, created_at'),
        sb.from('leads').select('id, status'),
        sb.from('quotes').select('id, status, service_type, price, created_at'),
        sb.from('messages').select('id'),
      ]);
      const profiles = pRes.data || [];
      const leads = lRes.data || [];
      const quotes = qRes.data || [];
      const messages = mRes.data || [];
      const accepted = quotes.filter(q => q.status === 'accepted' || q.status === 'completed').length;

      setData({ profiles: profiles.length, leads: leads.length, quotes: quotes.length, messages: messages.length, quotesAccepted: accepted, quotesData: quotes });
      setLoading(false);
    })();
  }, []);

  const funnel = React.useMemo(() => {
    const funnelTotal = data.profiles || 1;
    return [
      { label: 'Perfis cadastrados', n: data.profiles, pct: 100 },
      { label: 'Leads captados', n: data.leads, pct: Math.round(data.leads / funnelTotal * 100) },
      { label: 'Orçamentos solicitados', n: data.quotes, pct: Math.round(data.quotes / funnelTotal * 100) },
      { label: 'Orçamentos aceitos/concluídos', n: data.quotesAccepted, pct: Math.round(data.quotesAccepted / funnelTotal * 100) },
    ];
  }, [data]);

  const topServices = React.useMemo(() => {
    const serviceCounts = {};
    data.quotesData.forEach(q => {
      const s = q.service_type || q.title || 'Outros';
      serviceCounts[s] = (serviceCounts[s] || 0) + 1;
    });
    return Object.entries(serviceCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
  }, [data.quotesData]);

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando analytics...</div>;

  const serviceColors = [C.p1, C.p3, C.p7, C.p5, C.p6];

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Perfis" value={data.profiles} sub="cadastrados" trend="" color={C.p3} />
        <KPICard title="Leads" value={data.leads} sub="captados" trend="" color={C.p5} />
        <KPICard title="Orçamentos" value={data.quotes} sub="total" trend="" color={C.p1} />
        <KPICard title="Mensagens" value={data.messages} sub="enviadas" trend="" color={C.p6} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', gridColumn:'span 2' }}>
          <div style={{ fontWeight:700, marginBottom:16 }}>📈 Funil de Conversão</div>
          {funnel.map((s,i) => (
            <div key={i} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:13 }}>{s.label}</span>
                <span style={{ fontSize:13, fontWeight:700 }}>{s.n.toLocaleString('pt-BR')}</span>
              </div>
              <div style={{ background:C.border, borderRadius:4, height:8 }}>
                <div style={{ background:C.p1, height:8, borderRadius:4, width: Math.max(s.pct, 2)+'%' }}></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight:700, marginBottom:16 }}>🏆 Top Serviços</div>
          {topServices.length === 0 && <div style={{ color:C.muted, fontSize:13 }}>Nenhum orçamento ainda.</div>}
          {topServices.map(([name, count], i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:12, height:12, borderRadius:3, background:serviceColors[i % serviceColors.length] }}></div>
              <div style={{ flex:1, fontSize:12 }}>{name}</div>
              <div style={{ fontSize:13, fontWeight:700 }}>{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Categoria de quem fala: loja / profissional / cliente (cor + tag)
const senderKind = (p, isStore) => {
  if (isStore) return { label:'LOJA', fg:'#7a30d6', chip:'#efe7fb', bub:'#f3edfb', bd:'#d9c7f5' };
  if (p && (roleOf(p) === 'admin' || p.portal_access === true)) return { label:'LOJA', fg:'#7a30d6', chip:'#efe7fb', bub:'#f3edfb', bd:'#d9c7f5' };
  if (p && isProProfile(p)) return { label:'PROFISSIONAL', fg:'#d2541f', chip:'#fff1e8', bub:'#fff3ec', bd:'#f6d4bf' };
  return { label:'CLIENTE', fg:'#2563eb', chip:'#e8f0fe', bub:'#eef4ff', bd:'#cdddfb' };
};

const Chats = () => {
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [openConv, setOpenConv] = useState(null); // conversation_id
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState(null);
  // Ate quando o PORTAL ja leu cada conversa. Antes o numero na lista era
  // o total de mensagens da conversa — nunca zerava, entao nao dizia nada.
  const [lidoAte, setLidoAte] = useState({});   // conversation_id -> ISO
  const msgsEndRef = React.useRef(null);
  const subRef = React.useRef(null);

  const scrollToBottom = () => { msgsEndRef.current?.scrollIntoView({ behavior:'smooth' }); };

  // Load conversations list
  const loadConversations = async () => {
    const { data: { session } } = await supa.auth.getSession();
    if(session) setMyUserId(session.user.id);

    const { data, error } = await supa
      .from('messages')
      .select('id, sender_id, receiver_id, conversation_id, content, type, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if(error || !data){ setLoading(false); return; }

    const { data: reads } = await supa
      .from('portal_chat_reads').select('conversation_id, last_read_at').limit(2000);
    if(reads){
      const r = {};
      reads.forEach(x => { r[x.conversation_id] = x.last_read_at; });
      // Nao sobrescreve marca local mais nova (upsert ainda em voo).
      setLidoAte(prev => {
        const merged = { ...r };
        Object.keys(prev).forEach(k => {
          if(!merged[k] || new Date(prev[k]) > new Date(merged[k])) merged[k] = prev[k];
        });
        return merged;
      });
    }

    const ids = [...new Set(data.flatMap(m => [m.sender_id, m.receiver_id]).filter(Boolean))];
    let profMap = {};
    if(ids.length > 0){
      const { data: profs } = await supa.from('profiles').select('id, name, avatar_url, role, user_type, tag').in('id', ids);
      if(profs) profs.forEach(p => { profMap[p.id] = p; });
    }
    setProfiles(profMap);

    const convMap = {};
    data.forEach(m => {
      const key = m.conversation_id || m.sender_id || m.id;
      if(!convMap[key]) convMap[key] = { id: key, messages: [], lastMsg: m, participants: new Set(), is3way: false };
      convMap[key].messages.push(m);
      if(m.sender_id) convMap[key].participants.add(m.sender_id);
      if(m.receiver_id) convMap[key].participants.add(m.receiver_id);
      if(m.type === 'system' && m.content === '__STORE_ADDED__') convMap[key].is3way = true;
      if(!convMap[key].lastMsg || new Date(m.created_at) > new Date(convMap[key].lastMsg.created_at)) convMap[key].lastMsg = m;
    });
    const sorted = Object.values(convMap).sort((a,b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
    setConversations(sorted);
    setLoading(false);
  };

  useEffect(() => { loadConversations(); }, []);

  // NAO LIDAS: mensagem que chegou depois da ultima vez que o portal abriu
  // esta conversa, tirando o que o proprio operador mandou.
  const naoLidasConv = (conv) => {
    const desde = lidoAte[conv.id];
    return conv.messages.filter(m =>
      m.sender_id !== myUserId && (!desde || new Date(m.created_at) > new Date(desde))
    ).length;
  };

  const marcarConvLida = async (convId) => {
    const agora = new Date().toISOString();
    setLidoAte(s => ({ ...s, [convId]: agora }));       // otimista
    try { window.dispatchEvent(new CustomEvent('wa-lidas-mudou')); } catch(_){}
    await supa.from('portal_chat_reads')
      .upsert({ conversation_id: convId, last_read_at: agora }, { onConflict:'conversation_id' });
  };

  // Open a conversation
  const openChat = async (convId) => {
    setOpenConv(convId);
    marcarConvLida(convId);
    setChatLoading(true);
    setChatMsgs([]);

    const { data, error } = await supa
      .from('messages')
      .select('id, sender_id, receiver_id, conversation_id, content, type, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(200);

    if(!error && data) setChatMsgs(data);
    setChatLoading(false);
    setTimeout(scrollToBottom, 100);

    // Realtime subscription
    if(subRef.current) subRef.current.unsubscribe();
    subRef.current = supa
      .channel('portal-chat-' + convId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + convId },
        (payload) => {
          setChatMsgs(prev => {
            if(prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          marcarConvLida(convId); // esta aberta na tela: ja foi lida
          setTimeout(scrollToBottom, 100);
        })
      .subscribe();
  };

  // Cleanup subscription on unmount or conv change
  useEffect(() => { return () => { if(subRef.current) subRef.current.unsubscribe(); }; }, []);

  // Send message
  const sendMessage = async () => {
    const txt = msgText.trim();
    if(!txt || sending) return;
    setSending(true);
    setMsgText('');

    const { data: { session } } = await supa.auth.getSession();
    if(!session){ setSending(false); return; }

    // Find receiver from conversation participants
    const conv = conversations.find(c => c.id === openConv);
    const participantIds = conv ? [...conv.participants] : [];
    const receiverId = participantIds.find(id => id !== session.user.id) || null;

    const { data: inserted, error } = await supa.from('messages').insert({
      sender_id: session.user.id,
      receiver_id: receiverId,
      conversation_id: openConv,
      content: txt,
      type: 'store'
    }).select();
    if(error){
      console.error('Send error:', error);
      alert('Erro ao enviar: ' + error.message);
    } else if(inserted && inserted[0]){
      // Optimistic: add to chat immediately without waiting for realtime
      setChatMsgs(prev => {
        if(prev.some(m => m.id === inserted[0].id)) return prev;
        return [...prev, inserted[0]];
      });
    }
    setSending(false);
    setTimeout(scrollToBottom, 100);
  };

  const handleKeyDown = (e) => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } };

  const formatTime = (ts) => {
    if(!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) + ' ' + d.getHours() + ':' + (d.getMinutes()<10?'0':'') + d.getMinutes();
  };

  const getInitials = (name) => name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '??';

  if(loading) return <div style={{ padding:20, color:C.muted }}>Carregando mensagens...</div>;

  // Chat view (conversation open)
  if(openConv){
    const conv = conversations.find(c => c.id === openConv);
    const participantNames = conv ? [...conv.participants].map(id => profiles[id]?.name || 'Usuario').join(', ') : '';

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 120px)', background:C.white, borderRadius:16, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        {/* Chat header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid '+C.border, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <button aria-label="Voltar para lista de conversas" onClick={() => { setOpenConv(null); loadConversations(); }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:C.ink, padding:'4px 8px', borderRadius:8 }}>←</button>
          <div style={{ display:'flex', gap:-4 }}>
            {conv && [...conv.participants].slice(0,3).map((id, i) => {
              const p = profiles[id];
              return (
                <div key={id} style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', background:C.p2, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11, color:C.ink, marginLeft: i>0?-8:0, border:'2px solid '+C.white, position:'relative', zIndex:3-i }}>
                  {p?.avatar_url ? <img src={p.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : getInitials(p?.name||'')}
                </div>
              );
            })}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, color:C.ink }}>{participantNames}</div>
            <div style={{ fontSize:11, color:C.muted }}>
              {conv?.is3way && <span style={{ background:C.p1+'22', color:C.p1, borderRadius:4, fontSize:9, padding:'1px 6px', fontWeight:700, marginRight:6 }}>3-WAY</span>}
              {conv ? conv.participants.size + ' participantes' : ''}
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', background:'#faf8f5' }}>
          {chatLoading && <div style={{ textAlign:'center', color:C.muted, padding:20 }}>Carregando...</div>}
          {chatMsgs.filter(m => m.type !== 'system').map((m) => {
            const isMe = m.sender_id === myUserId;
            const isStore = m.type === 'store';
            const sender = profiles[m.sender_id];
            // Mostra quem respondeu de fato; "Cali Colors" só quando não há perfil do remetente
            const senderName = sender?.name || (isStore ? 'Cali Colors' : 'Usuario');
            const isImg = m.type === 'image' || (m.content && m.content.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i));
            const time = formatTime(m.created_at);
            const kind = senderKind(sender, isStore);

            return (
              <div key={m.id} style={{ display:'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap:8, marginBottom:14, alignItems:'flex-end' }}>
                {!isMe && (
                  <div style={{ width:32, height:32, borderRadius:'50%', overflow:'hidden', background: kind.chip, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:10, color: kind.fg, flexShrink:0 }}>
                    {sender?.avatar_url ? <img src={sender.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (sender ? getInitials(senderName) : 'CC')}
                  </div>
                )}
                <div style={{ maxWidth:'65%' }}>
                  <div style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom:3 }}>
                    <span style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'.4px', color:kind.fg, background:kind.chip, padding:'2px 8px', borderRadius:8 }}>
                      {senderName} · {kind.label}
                    </span>
                  </div>
                  <div style={{
                    padding: isImg ? 4 : '10px 14px',
                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: kind.bub,
                    color: C.ink,
                    fontSize:13, lineHeight:'1.4',
                    border: '1px solid '+kind.bd,
                    wordBreak:'break-word'
                  }}>
                    {isImg ? <img src={m.content} style={{ maxWidth:220, borderRadius:12, display:'block' }} /> : m.content}
                  </div>
                  <div style={{ fontSize:9, color:C.muted, marginTop:2, textAlign: isMe ? 'right' : 'left', marginLeft:4, marginRight:4 }}>{time}</div>
                </div>
              </div>
            );
          })}
          <div ref={msgsEndRef} />
        </div>

        {/* Input area */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid '+C.border, display:'flex', gap:10, alignItems:'center', flexShrink:0, background:C.white }}>
          <input
            value={msgText}
            onChange={e => setMsgText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            style={{ flex:1, padding:'10px 16px', borderRadius:24, border:'1px solid '+C.border, fontSize:13, outline:'none', background:'#faf8f5' }}
          />
          <button
            aria-label="Enviar mensagem"
            onClick={sendMessage}
            disabled={sending || !msgText.trim()}
            style={{ width:40, height:40, borderRadius:'50%', background: msgText.trim() ? C.p1 : C.border, color:'#fff', border:'none', cursor: msgText.trim() ? 'pointer' : 'default', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
          >➤</button>
        </div>
      </div>
    );
  }

  // Conversations list
  return (
    <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight:700, marginBottom:16, color:C.ink }}>Conversas</div>
      {conversations.length === 0 && <div style={{ color:C.muted, fontSize:13 }}>Nenhuma conversa encontrada.</div>}
      {conversations.map((conv, i) => {
        const m = conv.lastMsg;
        const sender = profiles[m.sender_id];
        const senderName = sender ? sender.name : (m.sender_id ? m.sender_id.slice(0,8) + '...' : 'Desconhecido');
        const senderAvatar = sender?.avatar_url;
        const initials = getInitials(senderName);
        const participantNames = [...conv.participants].map(id => profiles[id]?.name || '?').join(', ');
        const isPintor = sender && (sender.role === 'pintor' || sender.user_type === 'pintor');
        const lastContent = m.type === 'system' ? '(sistema)' : (m.type === 'image' ? '📷 Foto' : (m.content || '').substring(0, 60));
        const dt = m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        return (
          <div key={conv.id || i} onClick={() => openChat(conv.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < conversations.length - 1 ? '1px solid '+C.border : 'none', cursor:'pointer', transition:'background 0.15s', borderRadius:8 }}
            onMouseEnter={e => e.currentTarget.style.background='#faf8f5'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <div style={{ width:44, height:44, borderRadius:'50%', overflow:'hidden', background:C.p2, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, color:C.ink, flexShrink:0 }}>
              {senderAvatar ? <img src={senderAvatar} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
                <span style={{ fontWeight:600, fontSize:13 }}>{senderName}</span>
                {isPintor && <span style={{ background:C.ink, color:C.p1, borderRadius:6, fontSize:9, padding:'1px 6px', fontWeight:700 }}>PINTOR</span>}
                {conv.is3way && <span style={{ background:C.p1+'22', color:C.p1, borderRadius:6, fontSize:9, padding:'1px 6px', fontWeight:700 }}>3-WAY</span>}
                {conv.participants.size > 2 && !conv.is3way && <span style={{ background:C.p3+'22', color:C.p3, borderRadius:6, fontSize:9, padding:'1px 6px', fontWeight:700 }}>{conv.participants.size}P</span>}
              </div>
              <div style={{ fontSize:12, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lastContent}</div>
              {conv.participants.size > 1 && <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{participantNames}</div>}
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:11, color:C.muted }}>{dt}</div>
              {naoLidasConv(conv) > 0 && <div title={naoLidasConv(conv) + ' mensagem(ns) que voce ainda nao abriu'} style={{ background:C.p1, color:'#fff', borderRadius:10, fontSize:10, fontWeight:700, padding:'2px 7px', marginTop:4, display:'inline-block' }}>{naoLidasConv(conv)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══ IMPORTAR LEADS DE PLANILHA ═══════════════════════════════════════════
// Substituiu o "Busca AI" (2026-08-29), que NAO buscava nada: pedia pro
// modelo INVENTAR empresas plausiveis — nome, telefone, nota, tudo
// fabricado. Telefone inventado em formato valido e o telefone de alguem,
// e com o botao "Abordar" do lado isso vira mensagem pra estranho.
//
// Le CSV, nao .xlsx: xlsx e ZIP+XML e precisaria de biblioteca externa (o
// portal carrega script com SRI e sem bundler). No Excel: Arquivo →
// Salvar como → CSV.
//
// Dois detalhes que quebram importacao de planilha brasileira e que estao
// tratados aqui: o Excel pt-BR separa por PONTO E VIRGULA (nao virgula) e
// salva em ANSI/windows-1252 (nao UTF-8) — sem isso vem tudo numa coluna
// so, ou com acento virando caractere estranho.

const CSV_CAMPOS = [
  { k:'name',         rot:'Nome *',        req:true,  dicas:['nome','name','empresa','razao','razão','estabelecimento','titulo','título'] },
  { k:'phone',        rot:'Telefone *',    req:true,  dicas:['telefone','fone','celular','phone','whatsapp','contato','tel'] },
  { k:'category',     rot:'Categoria',     req:false, dicas:['categoria','category','tipo','ramo','atividade'] },
  { k:'segment',      rot:'Segmento',      req:false, dicas:['segmento','segment'] },
  { k:'city',         rot:'Cidade',        req:false, dicas:['cidade','city','municipio','município'] },
  { k:'neighborhood', rot:'Bairro',        req:false, dicas:['bairro','neighborhood','regiao','região'] },
  { k:'address',      rot:'Endereço',      req:false, dicas:['endereco','endereço','address','rua','logradouro'] },
  { k:'rating',       rot:'Nota',          req:false, dicas:['nota','rating','avaliacao','avaliação','estrelas'] },
  { k:'review_count', rot:'Nº avaliações', req:false, dicas:['avaliacoes','avaliações','review','reviews','review_count','qtd'] },
  { k:'priority',     rot:'Prioridade',    req:false, dicas:['prioridade','priority'] },
];

const semAcento = (t) => String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

// Parser de CSV na mao: trata aspas, aspas duplicadas ("") e quebra de
// linha DENTRO do campo — endereco com virgula entre aspas e a regra, nao
// a excecao, em planilha de lead.
const parseCSV = (texto, sep) => {
  const linhas = []; let campo = ''; let linha = []; let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i+1] === '"') { campo += '"'; i++; } else dentroAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { dentroAspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(v => String(v).trim() !== ''));
};

const detectarSeparador = (primeiraLinha) => {
  const cont = (ch) => (primeiraLinha.split(ch).length - 1);
  const cands = [[';', cont(';')], [',', cont(',')], ['\t', cont('\t')]];
  cands.sort((a,b) => b[1] - a[1]);
  return cands[0][1] > 0 ? cands[0][0] : ';';
};

// Excel pt-BR salva CSV em ANSI. Lemos como UTF-8 e, se aparecer o
// caractere de substituicao, relemos como windows-1252.
const decodificar = (buffer) => {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('windows-1252').decode(buffer); } catch(_) { return utf8; }
};

const soDigitos = (t) => String(t||'').replace(/\D/g,'');
const chaveTelefone = (t) => { const d = soDigitos(t); return d.length >= 8 ? d.slice(-8) : ''; };

const ImportarPlanilhaModal = ({ open, onClose, onPronto, existingLeads }) => {
  const [linhas, setLinhas] = useState(null);   // matriz do CSV
  const [mapa, setMapa] = useState({});         // campo → indice da coluna
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState('');
  const [relatorio, setRelatorio] = useState(null);
  const [importando, setImportando] = useState(false);

  const reset = () => { setLinhas(null); setMapa({}); setErro(''); setProgresso(''); setRelatorio(null); };
  const fechar = () => { reset(); onClose(); };

  const lerArquivo = async (file) => {
    reset();
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const texto = decodificar(buf).replace(/^﻿/, '');
      const sep = detectarSeparador((texto.split('\n')[0] || ''));
      const m = parseCSV(texto, sep);
      if (m.length < 2) { setErro('A planilha precisa ter o cabecalho e ao menos uma linha.'); return; }
      const cabec = m[0].map(h => semAcento(h));
      // Casa cada campo com a coluna cujo titulo mais parece com ele.
      const auto = {};
      CSV_CAMPOS.forEach(c => {
        const idx = cabec.findIndex(h => h && c.dicas.some(d => h === semAcento(d)));
        const idx2 = idx >= 0 ? idx : cabec.findIndex(h => h && c.dicas.some(d => h.includes(semAcento(d))));
        if (idx2 >= 0 && !Object.values(auto).includes(idx2)) auto[c.k] = idx2;
      });
      setMapa(auto); setLinhas(m);
    } catch(e) { setErro('Nao consegui ler o arquivo: ' + ((e && e.message) || '?')); }
  };

  const dados = linhas ? linhas.slice(1) : [];
  const val = (row, campo) => {
    const i = mapa[campo];
    return (i === undefined || i === null || i === '') ? '' : String(row[i] ?? '').trim();
  };

  const importar = async () => {
    if (mapa.name === undefined || mapa.phone === undefined) {
      setErro('Escolha ao menos as colunas de Nome e Telefone.'); return;
    }
    setImportando(true); setErro(''); setProgresso('Preparando…');

    const jaExiste = {};
    (existingLeads || []).forEach(l => { const k = chaveTelefone(l.phone); if (k) jaExiste[k] = true; });

    const rows = []; const semTelefone = []; const repetidos = [];
    const vistos = {};
    dados.forEach(r => {
      const nome = val(r, 'name');
      const tel = val(r, 'phone');
      const k = chaveTelefone(tel);
      if (!nome) return;
      if (!k) { semTelefone.push(nome); return; }
      if (jaExiste[k] || vistos[k]) { repetidos.push(nome); return; }
      vistos[k] = true;
      const nota = parseFloat(String(val(r,'rating')).replace(',', '.'));
      const qtd = parseInt(soDigitos(val(r,'review_count')), 10);
      const prio = semAcento(val(r,'priority'));
      rows.push({
        name: nome.slice(0, 200),
        phone: tel.slice(0, 40),
        segment: (val(r,'segment') || '').toUpperCase().slice(0, 40) || null,
        category: val(r,'category').slice(0, 80) || null,
        city: val(r,'city').slice(0, 80) || 'Guarulhos',
        neighborhood: val(r,'neighborhood').slice(0, 80) || null,
        address: val(r,'address').slice(0, 250) || null,
        rating: isFinite(nota) ? Math.min(5, Math.max(0, nota)) : null,
        review_count: isFinite(qtd) ? qtd : null,
        priority: ['alta','media','baixa'].includes(prio) ? prio : 'media',
        source: 'planilha',
        status: 'novo',
      });
    });

    if (!rows.length) {
      setImportando(false);
      setRelatorio({ salvos:0, semTelefone:semTelefone.length, repetidos:repetidos.length, falhas:0 });
      return;
    }

    // Em lotes: 1000 linhas num INSERT so estoura tempo/limite do PostgREST.
    let salvos = 0, falhas = 0, motivo = '';
    const LOTE = 200;
    for (let i = 0; i < rows.length; i += LOTE) {
      const fatia = rows.slice(i, i + LOTE);
      setProgresso('Salvando ' + Math.min(i + LOTE, rows.length) + ' de ' + rows.length + '…');
      try { await leadsService.insertBatch(fatia); salvos += fatia.length; }
      catch(e) {
        // Lote falhou: tenta linha a linha pra nao perder as boas. GUARDA A
        // MENSAGEM do banco — sem ela "o banco recusou 984" nao diz nada e
        // vira adivinhacao (RLS? coluna que nao existe? CHECK?).
        for (const row of fatia) {
          try { await leadsService.insertBatch([row]); salvos++; }
          catch(err) {
            falhas++;
            if(!motivo) motivo = (err && (err.message || err.hint || err.details)) || String(err);
          }
        }
      }
      if(motivo && salvos === 0 && i + LOTE < rows.length){
        // Tudo falhando pelo mesmo motivo: para de martelar o banco.
        falhas += rows.length - (i + fatia.length);
        break;
      }
    }
    setImportando(false); setProgresso('');
    setRelatorio({ salvos, semTelefone:semTelefone.length, repetidos:repetidos.length, falhas, motivo });
    onPronto();
  };

  if (!open) return null;
  const sel = { padding:'6px 8px', borderRadius:8, border:'1px solid '+C.border, fontSize:12, background:'#fff', width:'100%' };

  return (
    <div onClick={fechar} style={{ position:'fixed', inset:0, background:'rgba(26,26,46,.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:18, width:'min(760px, 96vw)', maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding:'16px 20px', background:C.ink, color:'#fff', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:'Syne,sans-serif' }}>📥 Importar leads de planilha</div>
          <button onClick={fechar} style={{ background:'none', border:'none', color:'#fff', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:20 }}>
          {!linhas ? (
            <div>
              <div style={{ fontSize:13, color:C.ink, lineHeight:1.6, marginBottom:14 }}>
                No Excel: <strong>Arquivo → Salvar como → CSV</strong>. Depois escolha o arquivo aqui.
                A primeira linha tem que ser o cabeçalho (Nome, Telefone, Categoria…).
              </div>
              <input type="file" accept=".csv,.txt,text/csv" onChange={e=>lerArquivo(e.target.files && e.target.files[0])}
                style={{ display:'block', width:'100%', padding:14, border:'2px dashed '+C.border, borderRadius:12, fontSize:13, cursor:'pointer' }} />
              <div style={{ fontSize:11, color:C.muted, marginTop:10 }}>
                Nada é enviado até você conferir as colunas na próxima tela.
              </div>
            </div>
          ) : relatorio ? (
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:C.ink, marginBottom:10 }}>
                {relatorio.salvos > 0 ? '✅ ' + relatorio.salvos + ' leads importados' : 'Nenhum lead novo importado'}
              </div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.8 }}>
                {relatorio.repetidos > 0 ? <div>· {relatorio.repetidos} já existiam (mesmo telefone) e foram pulados</div> : null}
                {relatorio.semTelefone > 0 ? <div>· {relatorio.semTelefone} sem telefone válido — ficaram de fora</div> : null}
                {relatorio.falhas > 0 ? <div style={{ color:'#b91c1c' }}>· {relatorio.falhas} o banco recusou</div> : null}
                {relatorio.motivo ? (
                  <div style={{ marginTop:10, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 10px', color:'#b91c1c', fontSize:12, lineHeight:1.5, wordBreak:'break-word' }}>
                    <strong>Motivo da recusa:</strong><br/>{relatorio.motivo}
                  </div>
                ) : null}
              </div>
              <button onClick={fechar} style={{ marginTop:18, background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, fontSize:13, cursor:'pointer' }}>Fechar</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:13, color:C.ink, marginBottom:4 }}>
                <strong>{dados.length}</strong> linhas lidas. Confira em que coluna está cada informação:
              </div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Só Nome e Telefone são obrigatórios. O resto pode ficar em branco.</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
                {CSV_CAMPOS.map(c => (
                  <div key={c.k}>
                    <label style={{ fontSize:11, fontWeight:700, color: c.req ? C.p1 : C.muted, display:'block', marginBottom:3 }}>{c.rot}</label>
                    <select value={mapa[c.k] === undefined ? '' : mapa[c.k]} style={sel}
                      onChange={e => setMapa(m => ({ ...m, [c.k]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                      <option value="">— não tenho —</option>
                      {linhas[0].map((h, i) => <option key={i} value={i}>{h || ('Coluna ' + (i+1))}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:16, fontSize:11, fontWeight:700, color:C.muted }}>PRÉVIA DAS 3 PRIMEIRAS</div>
              <div style={{ overflowX:'auto', border:'1px solid '+C.border, borderRadius:10, marginTop:6 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:C.bg }}>
                    {CSV_CAMPOS.filter(c => mapa[c.k] !== undefined).map(c =>
                      <th key={c.k} style={{ padding:'7px 9px', textAlign:'left', fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{c.rot}</th>)}
                  </tr></thead>
                  <tbody>
                    {dados.slice(0,3).map((r,i) => (
                      <tr key={i} style={{ borderTop:'1px solid '+C.border }}>
                        {CSV_CAMPOS.filter(c => mapa[c.k] !== undefined).map(c =>
                          <td key={c.k} style={{ padding:'7px 9px', whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }}>{val(r, c.k)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {erro ? <div style={{ color:'#b91c1c', fontSize:12, marginTop:12 }}>{erro}</div> : null}
              <div style={{ display:'flex', gap:10, marginTop:18, alignItems:'center' }}>
                <button onClick={importar} disabled={importando}
                  style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'11px 24px', fontWeight:700, fontSize:13, cursor: importando?'wait':'pointer' }}>
                  {importando ? 'Importando…' : 'Importar ' + dados.length + ' linhas'}
                </button>
                <button onClick={reset} disabled={importando}
                  style={{ background:'none', border:'1px solid '+C.border, borderRadius:10, padding:'11px 18px', fontSize:13, cursor:'pointer', color:C.muted }}>Trocar arquivo</button>
                <span style={{ fontSize:12, color:C.muted }}>{progresso}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Constantes estáticas dos Leads — movidas para módulo (eram recriadas a cada render).
const LEAD_SEG_COLORS = { AUTOMOTIVO: '#e63946', GRAFFITI: '#8338ec', RESIDENCIAL: '#ff6b35', COMERCIAL: '#2ec4b6' };
const LEAD_SEG_ICONS = { AUTOMOTIVO: '🚗', GRAFFITI: '🎨', 'GRAFFITI/ARTE': '🎨', RESIDENCIAL: '🏠', COMERCIAL: '🏢' };
const LEAD_CAT_ICONS = { 'Funilaria/Auto': '🚗', 'Graffiti/Arte': '🎨', 'Pintor': '🖌', 'Reformas': '🔧', 'Construtoras': '🏗', 'Imobiliárias': '🏢', 'Arquitetura': '✏', 'Materiais': '🧱', 'Condomínios': '🏘', 'Academias': '💪', 'Bares': '🍺', 'Limpeza': '🧹', 'Marmoraria': '💎', 'Engenharia': '📐' };
const LEAD_STATUS_COLORS = { novo: C.p3, contactado: C.p7, qualificado: C.p6, convertido: C.p1, perdido: C.p4 };

// ══ ABORDAGEM DE LEAD POR WHATSAPP ═══════════════════════════════════════
// Mensagem personalizada por SEGMENTO, com produtos do NOSSO catalogo.
// REGRA DE NEGOCIO (decisao do dono, 2026-08-29): a mensagem NUNCA leva
// preco nem orcamento — isso e trabalho de pessoa. Por isso o card de
// produto aqui mostra nome/linha/volume e nada de R$.

// Numero do lead → formato do WhatsApp. Cobre o celular ANTIGO de 8 digitos
// (comecando 8/9, de antes de 2016) que precisa ganhar o nono digito.
const normalizeLeadPhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  if(!d) return null;
  if(d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if(d.length === 11 && d[2] === '9') return '55' + d;      // celular novo
  if(d.length === 10 && /^[89]/.test(d.slice(2))) return '55' + d.slice(0,2) + '9' + d.slice(2); // celular antigo
  if(d.length === 10) return '55' + d;                       // fixo
  if(d.length >= 11 && d.length <= 15) return d;             // DDI estrangeiro
  return null;
};

// Celular ou fixo, so pelo formato (deterministico no Brasil).
const tipoDeLinha = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if(local.length === 11 && local[2] === '9') return 'celular';
  if(local.length === 10 && /^[89]/.test(local.slice(2))) return 'celular';
  if(local.length === 10) return 'fixo';
  return 'desconhecido';
};

// Mapa CATEGORIA DO LEAD → o que oferecer + palavras que acham o produto no
// catalogo (busca no NOME, que e mais confiavel que a taxonomia). Ajustar
// aqui quando a loja quiser mudar o que oferece pra cada tipo de cliente.
const LEAD_PITCH = {
  // `oferta` = o que a loja diz que TEM pra esse publico. Frase generica de
  // proposito (2026-08-29): antes a mensagem listava SKU com volume, e saia
  // coisa como "AROMINHA SPRAY CARRO NOVO 60ML (18L)" pra um grafiteiro —
  // item errado e volume errado (o catalogo tem 18L como padrao em tudo).
  // Quem vende e a pessoa; a abordagem so precisa dizer que a loja tem a
  // linha que aquele profissional usa.
  'Funilaria/Auto': { funil:'fornece', linha:'linha automotiva',
    fecho:'Quer ver como funciona a tinta preparada na hora aqui na loja?',
    oferta:'linha automotiva completa: tinta pronta e tinta preparada na hora, primer, verniz, massa plástica, e os materiais de acabamento e detalhamento (polimento, cera)',
    termos:['automotiv','primer','verniz','poliester','massa pl','fundo'] },
  'Auto Center':    { funil:'fornece', linha:'linha automotiva',
    fecho:'Quer ver como funciona a tinta preparada na hora aqui na loja?',
    oferta:'linha automotiva completa: tinta pronta e preparada na hora, primer, verniz e material de polimento e cera',
    termos:['automotiv','primer','verniz','fundo','cera','polim'] },
  'Pintor':         { funil:'fornece', linha:'linha residencial e comercial',
    fecho:'Quer saber qual linha rende mais por lata? Tem uma que costuma surpreender quem testa.',
    oferta:'tintas de várias marcas, da econômica à premium, incluindo linhas de alto rendimento que fecham parede com menos demão — além de massa corrida, selador e textura',
    termos:['latex','acrilic','massa corrida','seladora','fundo'] },
  'Graffiti/Arte':  { funil:'fornece', linha:'linha de spray e arte',
    fecho:'Quer ver a cartela de cores que temos em spray?',
    oferta:'spray Colorgin e Arte Urbana, com a cartela de cores completa, além de tinta acrílica pra mural e base de parede',
    termos:['colorgin','arte urbana','spray','aerossol'] },
  'Construtora':    { funil:'fornece', linha:'linha de obra em grande volume',
    fecho:'Quer ver como a gente atende obra em volume?',
    oferta:'linha de obra em grande volume: acrílico, fundo preparador, textura e impermeabilizante, em lata de 18L',
    termos:['acrilic','latex','fundo prepar','textura','18l'] },
  'Reforma':        { funil:'fornece', linha:'linha de reforma',
    fecho:'Quer ver o que costuma poupar tempo numa reforma?',
    oferta:'tinta econômica e premium, massa corrida, selador e textura — tudo o que a reforma pede',
    termos:['acrilic','latex','massa','seladora'] },
  'Materiais':      { funil:'fornece', linha:'linha completa pra revenda',
    fecho:'Quer conhecer a nossa lista pra revenda?',
    oferta:'linha completa pra revenda, de várias marcas: acrílico, esmalte, solvente e complementos',
    termos:['acrilic','latex','esmalte','solvente'] },
  'Marmoraria':     { funil:'fornece', linha:'impermeabilizantes e vernizes',
    fecho:'Quer ver o que a gente indica pra proteger pedra?',
    oferta:'impermeabilizantes, vernizes e resinas pra pedra',
    termos:['verniz','impermeab','resina'] },
  'Limpeza':        { funil:'fornece', linha:'linha de manutencao predial',
    fecho:'Quer ver a linha que a gente indica pra manutenção predial?',
    oferta:'linha de manutenção predial: acrílico, esmalte e solventes',
    termos:['acrilic','esmalte','solvente'] },
  'Engenharia':     { funil:'fornece', linha:'linha de obra e manutencao predial',
    fecho:'Quer receber a nossa cartela de cores e as fichas técnicas?',
    oferta:'linhas premium de acabamento e a linha de obra em grande volume: acrílico, fundo preparador, textura e impermeabilizante',
    termos:['acrilic','latex','fundo prepar','textura','impermeab'] },
  'Imobiliária':    { funil:'demanda', linha:'pintura de imoveis pra locacao e venda',
    oferta:'tinta pra imóvel de locação e venda, do custo-benefício ao acabamento premium',
    termos:['acrilic','latex','massa corrida'] },
  'Condomínio':     { funil:'demanda', linha:'pintura de fachada e areas comuns',
    oferta:'linha de fachada e áreas comuns: acrílico, textura e impermeabilizante',
    termos:['fachada','acrilic','textura','impermeab'] },
  'Bares':          { funil:'demanda', linha:'pintura de salao e fachada',
    oferta:'tinta pra salão e fachada, com acabamento lavável',
    termos:['acrilic','esmalte','epoxi'] },
  'Academia':       { funil:'demanda', linha:'pintura de salao e piso',
    oferta:'tinta de piso e de parede pra área de treino',
    termos:['epoxi','piso','acrilic'] },
  'Supermercado':   { funil:'demanda', linha:'pintura de loja, piso e fachada',
    oferta:'tinta de piso, parede e fachada pra loja',
    termos:['epoxi','piso','acrilic','fachada'] },
  'Pousada':        { funil:'demanda', linha:'pintura de quartos e fachada',
    oferta:'tinta pra quarto, área comum e fachada',
    termos:['acrilic','latex','fachada'] },
  'Arquitetura':    { funil:'demanda', linha:'especificacao de cores e acabamentos',
    oferta:'linhas premium de acabamento — acetinado, fosco, efeitos e texturas — com cartela de cores completa pra especificação',
    termos:['acrilic','textura','efeito'] },
};
const pitchDoLead = (l) => LEAD_PITCH[l.category] ||
  { funil:'demanda', linha:'linha completa de tintas',
    oferta:'linha completa de tintas, das econômicas às premium',
    fecho:'Quer ver o que temos pra sua linha de trabalho?',
    termos:['acrilic','latex'] };

// Monta o texto da abordagem. Sem preco — ver regra no topo do bloco.
const montarAbordagem = (lead, produtos) => {
  const p = pitchDoLead(lead);
  const nome = (lead.name || '').trim();
  const ondeEsta = lead.neighborhood || lead.city || '';
  const saudacao = 'Olá' + (nome ? ', ' + nome : '') + '!';
  const abre = ' Aqui é a Cali Colors, loja de tintas em Guarulhos.';
  const contexto = ondeEsta ? ' Vi que vocês atuam em ' + ondeEsta + '.' : '';
  // Produto especifico e OPCIONAL e entra sem volume/cor: o catalogo tem
  // "18L" como padrao em tudo, entao citar tamanho era mentir.
  const citados = produtos.length
    ? ' Tem, por exemplo, ' + produtos.map(x => x.name).slice(0,3).join(', ') + '.'
    : '';

  let corpo;
  if(p.funil === 'fornece'){
    corpo = '\n\nTemos ' + p.oferta + '.' + citados +
      ' Atendemos profissional com condição especial.' +
      '\n\n' + (p.fecho || 'Quer ver o que temos pra sua linha de trabalho?');
  } else {
    corpo = '\n\nTemos ' + p.oferta + '.' + citados +
      ' Fornecemos a tinta e indicamos profissionais de confiança pra execução.' +
      '\n\nVocês têm algo pra pintar ou reformar nos próximos meses?';
  }
  // Sem convite pro app e sem rodapé de opt-out, a pedido da loja
  // (2026-08-29). A palavra PARE continua funcionando: quem responder
  // isso é marcado como opted_out e não recebe mais nada — só deixou de
  // ser anunciada na mensagem.
  return saudacao + abre + contexto + corpo;
};

// Janela de abordagem: mostra o que sabemos do lead, sugere produtos do
// catalogo pelo segmento (marcaveis), deixa editar o texto e envia pelo
// canal da loja.
const AbordagemModal = ({ lead, onClose, onSent }) => {
  const [produtos, setProdutos] = useState([]);
  const [sel, setSel] = useState({});
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [editado, setEditado] = useState(false);
  const pitch = pitchDoLead(lead);
  const alvo = normalizeLeadPhone(lead.phone);
  const linha = tipoDeLinha(lead.phone);

  // Busca no catalogo pelos termos do segmento (ou pela busca manual).
  const buscarProdutos = async (termosManuais) => {
    setCarregando(true);
    const termos = termosManuais ? [termosManuais] : pitch.termos;
    const filtro = termos.map(t => 'name.ilike.*' + t + '*').join(',');
    const { data } = await supa.from('products')
      .select('id, name, volume, line, category, stock, active')
      .or(filtro).eq('active', true).limit(12);
    const lista = (data || []).filter(p => (p.stock == null || p.stock > 0)).slice(0, 8);
    setProdutos(lista);
    // NADA marcado por padrao (2026-08-29). Marcar sozinho enfiava SKU
    // aleatorio na mensagem — um grafiteiro recebia "AROMINHA SPRAY CARRO
    // NOVO 60ML" so porque o termo 'spray' casou. A mensagem ja diz o que a
    // loja tem pro segmento; produto especifico e escolha do operador.
    if(!termosManuais) setSel({});
    setCarregando(false);
  };

  useEffect(() => { buscarProdutos(); }, []);

  // Recompoe o texto sempre que a selecao muda — a menos que o operador
  // ja tenha editado na mao (nao sobrescrever o trabalho dele).
  const escolhidos = produtos.filter(p => sel[p.id]);
  useEffect(() => {
    if(!editado) setTexto(montarAbordagem(lead, escolhidos));
  }, [produtos, sel, editado]);

  const enviar = async () => {
    if(!alvo){ setErro('Numero invalido neste lead.'); return; }
    if(!texto.trim()){ setErro('A mensagem esta vazia.'); return; }
    setEnviando(true); setErro('');
    try {
      const { data: { session } } = await supa.auth.getSession();
      if(!session){ setErro('Sessao expirada — entre de novo.'); setEnviando(false); return; }
      const r = await fetch('/api/whatsapp/send', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ accessToken: session.access_token, to: alvo, body: texto })
      });
      let raw = ''; try { raw = await r.text(); } catch(_){}
      let res = {}; try { res = JSON.parse(raw); } catch(_){}
      if(!r.ok || !res.ok){
        const snippet = res.error ? '' : (raw||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,140);
        setErro(res.error || ('Falha no envio (HTTP ' + r.status + (snippet ? ' — ' + snippet : '') + ')'));
        setEnviando(false);
        return;
      }
      // Enviou: marca o lead como contactado (best-effort — a mensagem ja saiu).
      try {
        await supa.from('leads').update({ status:'contactado' }).eq('id', lead.id);
      } catch(_){}
      if(onSent) onSent(alvo);
      onClose();
    } catch(_){ setErro('Falha de rede ao enviar.'); }
    setEnviando(false);
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(26,26,46,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'min(720px, 96vw)', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,.24)' }}>
        {/* Cabecalho */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid '+C.border, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:C.ink }}>{lead.name || 'Lead sem nome'}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
              <span>{lead.category || '—'}</span>
              <span>·</span>
              <span>{pitch.funil === 'fornece' ? '🎨 fornece obra (compra tinta)' : '🏢 precisa de obra'}</span>
              <span>·</span>
              <span>{lead.phone || 'sem telefone'}</span>
              <span style={{ background: linha==='celular' ? C.p6+'22' : C.p7+'33', color: linha==='celular' ? C.p6 : '#b8860b', borderRadius:6, padding:'1px 7px', fontWeight:600 }}>
                {linha === 'celular' ? 'celular' : linha === 'fixo' ? 'fixo (pode não ter WhatsApp)' : 'formato estranho'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:C.muted, lineHeight:1 }}>×</button>
        </div>

        {/* Corpo rolavel */}
        <div style={{ padding:20, overflowY:'auto', flex:1 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.ink, marginBottom:8 }}>
            Citar algum produto? <span style={{ fontWeight:400, color:C.muted }}>— opcional. A mensagem já diz o que a loja tem pra este segmento.</span>
          </div>
          <input value={busca} onChange={e=>setBusca(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter'){ e.preventDefault(); buscarProdutos(busca.trim() || null); } }}
            placeholder="Buscar outro produto no catálogo e apertar Enter…"
            style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1.5px solid '+C.border, fontSize:13, outline:'none', marginBottom:10 }} />
          {carregando ? (
            <div style={{ color:C.muted, fontSize:13, padding:'10px 0' }}>Buscando no catálogo…</div>
          ) : produtos.length === 0 ? (
            <div style={{ color:C.muted, fontSize:13, padding:'10px 0' }}>
              Nenhum produto casou com este segmento. Tudo bem: a mensagem já fala das linhas que a loja tem. Use a busca acima se quiser citar algo específico.
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              {produtos.map(p => (
                <label key={p.id} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'8px 10px', border:'1px solid '+(sel[p.id]?C.p1:C.border), borderRadius:10, cursor:'pointer', background: sel[p.id]?C.p1+'0d':'#fff' }}>
                  <input type="checkbox" checked={!!sel[p.id]}
                    onChange={()=>{ setSel(s => ({ ...s, [p.id]: !s[p.id] })); setEditado(false); }} />
                  <span style={{ fontSize:12, lineHeight:1.35 }}>
                    <span style={{ fontWeight:600, color:C.ink }}>{p.name}</span>
                    {p.line ? <div style={{ color:C.muted, fontSize:11 }}>{p.line}</div> : null}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div style={{ fontSize:12, fontWeight:700, color:C.ink, marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Mensagem</span>
            {editado ? (
              <button onClick={()=>setEditado(false)} style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'2px 8px', fontSize:11, cursor:'pointer', color:C.muted }}>
                ↺ Voltar ao texto automático
              </button>
            ) : null}
          </div>
          <textarea value={texto} onChange={e=>{ setTexto(e.target.value); setEditado(true); }} rows={10}
            style={{ width:'100%', padding:12, borderRadius:12, border:'1.5px solid '+C.border, fontSize:13, lineHeight:1.5, outline:'none', resize:'vertical', fontFamily:'DM Sans, sans-serif' }} />
          <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
            Sem preço por regra da loja — valor e orçamento são tratados por uma pessoa.
          </div>
          {erro ? <div style={{ marginTop:10, padding:'8px 12px', background:'#fdecea', color:'#b3261e', borderRadius:8, fontSize:12 }}>{erro}</div> : null}
        </div>

        {/* Rodape */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid '+C.border, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, color:C.muted }}>Envia pelo número da loja · +55 11 92072-5935</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ background:'none', border:'1px solid '+C.border, borderRadius:10, padding:'9px 16px', fontSize:13, cursor:'pointer', color:C.muted }}>Cancelar</button>
            <button onClick={enviar} disabled={enviando || !alvo}
              style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'9px 22px', fontSize:13, fontWeight:700, cursor: enviando?'wait':'pointer', opacity: enviando||!alvo ? .6 : 1 }}>
              {enviando ? 'Enviando…' : '📤 Enviar abordagem'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
// ── Cabecalho da tabela de leads: ordena e filtra ────────────────────────
// Antes o header era uma lista de textos com "↕" decorativo. Cada coluna
// agora ordena (clique no titulo, clique de novo inverte) e tem filtro
// proprio no "▾". O estado vive no componente Leads e chega via `ctx`.
const filtroInput = { width:'100%', padding:'7px 9px', borderRadius:8, border:'1px solid #e5e0d8', fontSize:12, outline:'none' };

const OpcoesFiltro = ({ opcoes, valor, onPick, fechar }) => (
  <div style={{ maxHeight:260, overflowY:'auto', margin:-4 }}>
    {opcoes.map(([v, rot, qtd]) => (
      <button key={String(v)} onClick={()=>{ onPick(v); fechar(); }}
        style={{ display:'flex', width:'100%', alignItems:'center', justifyContent:'space-between', gap:10,
          background: valor === v ? C.p1+'18' : 'none', border:'none', borderRadius:7, padding:'7px 9px',
          fontSize:12, cursor:'pointer', color: valor === v ? C.p1 : C.ink, fontWeight: valor === v ? 700 : 400,
          textAlign:'left' }}>
        <span>{rot}</span>
        {qtd != null ? <span style={{ color:C.muted, fontSize:11 }}>{qtd}</span> : null}
      </button>
    ))}
  </div>
);

const ThLead = ({ rot, campo, ativo, ctx, children }) => {
  const ordenando = campo && ctx.sortCol === campo;
  const aberto = ctx.menuCol === rot;
  return (
    <th style={{ position:'relative', textAlign:'left', padding:'12px 10px', color:C.muted,
      fontWeight:600, fontSize:11, textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        {campo ? (
          <button onClick={()=>ctx.ordenarPor(campo)} title="Ordenar por esta coluna"
            style={{ background:'none', border:'none', padding:0, cursor:'pointer', font:'inherit',
              textTransform:'inherit', letterSpacing:'inherit', color: ordenando ? C.p1 : C.muted,
              display:'inline-flex', alignItems:'center', gap:4 }}>
            {rot}<span style={{ fontSize:9 }}>{ordenando ? (ctx.sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
          </button>
        ) : <span>{rot}</span>}
        {children ? (
          <button onClick={()=>ctx.setMenuCol(aberto ? null : rot)} title="Filtrar esta coluna"
            style={{ background: ativo ? C.p1 : 'none', color: ativo ? '#fff' : C.border, border:'none',
              borderRadius:5, width:16, height:16, lineHeight:'14px', fontSize:9, cursor:'pointer', padding:0 }}>▼</button>
        ) : null}
      </span>
      {children && aberto ? (
        <span>
          <span onClick={()=>ctx.setMenuCol(null)} style={{ position:'fixed', inset:0, zIndex:40, display:'block' }} />
          <div style={{ position:'absolute', top:'100%', left:6, zIndex:41, background:'#fff',
            border:'1px solid '+C.border, borderRadius:10, boxShadow:'0 10px 30px rgba(26,26,46,.16)',
            padding:8, minWidth:200, textTransform:'none', letterSpacing:0, fontWeight:400 }}>
            {children}
          </div>
        </span>
      ) : null}
    </th>
  );
};

const LEAD_PRIO_COLORS = { alta: C.p6, media: C.p7, baixa: C.muted };

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroSegmento, setFiltroSegmento] = useState('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  // ORDENACAO E FILTRO POR COLUNA (2026-08-29). Antes o cabecalho tinha
  // setinhas "↕" que eram so enfeite — nao ordenavam nada. Agora cada
  // coluna ordena de verdade e tem o proprio filtro no "▾".
  const [sortCol, setSortCol] = useState('rating');
  const [sortDir, setSortDir] = useState('desc');
  const [menuCol, setMenuCol] = useState(null);   // qual filtro esta aberto
  const [fNome, setFNome] = useState('');
  const [fTel, setFTel] = useState('');
  const [fPrio, setFPrio] = useState('Todas');
  const [fRating, setFRating] = useState(0);
  const [fCidade, setFCidade] = useState('Todas');
  const [importOpen, setImportOpen] = useState(false);
  const [abordar, setAbordar] = useState(null); // lead da janela de abordagem

  const removeDuplicates = async (allLeads) => {
    const seen = {};
    const dupeIds = [];
    for (const l of allLeads) {
      const key = (l.name || '').trim().toLowerCase();
      if (!key) continue;
      if (seen[key]) {
        dupeIds.push(l.id);
      } else {
        seen[key] = true;
      }
    }
    if (dupeIds.length > 0) {
      for (const id of dupeIds) {
        try { await leadsService.remove(id); } catch(e) { console.warn('leads.remove dup error:', e); }
      }
    }
    return dupeIds.length;
  };

  const fetchLeads = async () => {
    try {
      const rows = await leadsService.list();
      setLeads(rows);
    } catch (e) {
      console.error('fetchLeads error:', e);
      setLeads([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const updateStatus = async (id, newStatus) => {
    try {
      await leadsService.updateStatus(id, newStatus);
      fetchLeads();
    } catch (e) { alert('Erro ao atualizar status: ' + (e.message || e)); }
  };

  const statusColor = (s) => LEAD_STATUS_COLORS[s] || C.muted;
  const prioColor = (p) => LEAD_PRIO_COLORS[p] || C.muted;
  const segColors = LEAD_SEG_COLORS;

  // Filters + sort — pesado quando há muitos leads. Memoizado por estado de filtro/busca/lista.
  const filtered = React.useMemo(() => {
    let out = leads;
    if (busca) {
      const q = busca.toLowerCase();
      out = out.filter(l => (l.name||'').toLowerCase().includes(q) || (l.segment||'').toLowerCase().includes(q) || (l.category||'').toLowerCase().includes(q) || (l.neighborhood||'').toLowerCase().includes(q));
    }
    if (filtroStatus !== 'Todos') out = out.filter(l => l.status === filtroStatus.toLowerCase());
    if (filtroSegmento !== 'TODOS') out = out.filter(l => (l.segment||'').toUpperCase() === filtroSegmento);
    if (filtroCategoria !== 'Todas') out = out.filter(l => l.category === filtroCategoria);
    // Filtros de coluna (cabecalho)
    if (fNome.trim()) { const q = fNome.trim().toLowerCase(); out = out.filter(l => (l.name||'').toLowerCase().includes(q)); }
    if (fTel.trim()) { const d = fTel.replace(/\D/g,''); if(d) out = out.filter(l => (l.phone||'').replace(/\D/g,'').includes(d)); }
    if (fPrio !== 'Todas') out = out.filter(l => (l.priority||'media') === fPrio);
    if (fRating > 0) out = out.filter(l => Number(l.rating||0) >= fRating);
    if (fCidade !== 'Todas') out = out.filter(l => (l.city||'—') === fCidade);

    // Ordenacao: numero compara como numero, o resto como texto (pt-BR).
    const dir = sortDir === 'asc' ? 1 : -1;
    const numerica = sortCol === 'rating' || sortCol === 'review_count';
    out = [...out].sort((a,b) => {
      if (numerica) return ((Number(a[sortCol])||0) - (Number(b[sortCol])||0)) * dir;
      return String(a[sortCol]||'').localeCompare(String(b[sortCol]||''), 'pt-BR') * dir;
    });
    return out;
  }, [leads, busca, filtroStatus, filtroSegmento, filtroCategoria, sortCol, sortDir,
      fNome, fTel, fPrio, fRating, fCidade]);

  const cidades = React.useMemo(() => {
    const c = {};
    leads.forEach(l => { const k = l.city || '—'; c[k] = (c[k]||0)+1; });
    return c;
  }, [leads]);

  const filtrosAtivos = (busca?1:0) + (filtroStatus!=='Todos'?1:0) + (filtroSegmento!=='TODOS'?1:0)
    + (filtroCategoria!=='Todas'?1:0) + (fNome?1:0) + (fTel?1:0) + (fPrio!=='Todas'?1:0)
    + (fRating>0?1:0) + (fCidade!=='Todas'?1:0);
  // Clique no titulo ordena; clique de novo inverte. Coluna nova comeca
  // decrescente quando e numero (nota/avaliacoes) e crescente em texto.
  const ordenarPor = (campo) => {
    if (sortCol === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(campo); setSortDir(campo === 'rating' || campo === 'review_count' ? 'desc' : 'asc'); }
  };
  const thCtx = { sortCol, sortDir, ordenarPor, menuCol, setMenuCol };

  const limparFiltros = () => {
    setBusca(''); setFiltroStatus('Todos'); setFiltroSegmento('TODOS'); setFiltroCategoria('Todas');
    setFNome(''); setFTel(''); setFPrio('Todas'); setFRating(0); setFCidade('Todas'); setMenuCol(null);
  };

  // Segment / Category / Status counts — só dependem de leads.
  const segments = React.useMemo(() => {
    const s = {};
    leads.forEach(l => { const k = (l.segment||'Outros').toUpperCase(); s[k] = (s[k]||0)+1; });
    return s;
  }, [leads]);

  const categories = React.useMemo(() => {
    const c = {};
    leads.forEach(l => { const k = l.category||'Outros'; c[k] = (c[k]||0)+1; });
    return c;
  }, [leads]);

  const statusCounts = React.useMemo(() => {
    const sc = { total: leads.length };
    ['novo','contactado','qualificado','convertido','perdido'].forEach(s => {
      sc[s] = leads.filter(l => l.status === s).length;
    });
    return sc;
  }, [leads]);

  const sortedSegments = React.useMemo(() => Object.entries(segments).sort((a,b) => b[1]-a[1]), [segments]);
  const sortedCategories = React.useMemo(() => Object.entries(categories).sort((a,b) => b[1]-a[1]), [categories]);

  const exportCSV = () => {
    const header = ['#','Nome','Cidade','Bairro','Endereco','Segmento','Categoria','Rating','Reviews','Telefone','Prioridade','Status'];
    const rows = filtered.map((l,i) => [i+1, l.name||'', l.city||'', l.neighborhood||'', l.address||'', l.segment||'', l.category||'', l.rating||'', l.review_count||'', l.phone||'', l.priority||'', l.status||'']);
    const csv = [header, ...rows].map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'leads_calicolors.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Abre o WhatsApp no APARELHO do operador (canal secundario — quando ele
  // prefere falar do proprio celular em vez do numero da loja).
  const openWhatsApp = (phone, name) => {
    if (!phone) return;
    const alvo = normalizeLeadPhone(phone);
    if (!alvo) { alert('Numero invalido neste lead.'); return; }
    const msg = encodeURIComponent('Olá ' + (name||'') + '! Somos da Cali Colors — QueroUmaCor. Gostaríamos de apresentar nossa plataforma para você. Podemos conversar?');
    window.open('https://wa.me/' + alvo + '?text=' + msg, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando leads...</div>;

  const segIcons = LEAD_SEG_ICONS;
  const catIcons = LEAD_CAT_ICONS;

  return (
    <div>
      {/* KPI BAR */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ background:C.white, borderRadius:20, padding:'8px 16px', display:'flex', alignItems:'center', gap:6, border:'1px solid '+C.border }}>
          <span style={{ color:C.p1, fontWeight:700, fontSize:16 }}>{leads.length}</span><span style={{ color:C.muted, fontSize:12 }}>leads</span>
        </div>
        <div style={{ background:C.white, borderRadius:20, padding:'8px 16px', display:'flex', alignItems:'center', gap:6, border:'1px solid '+C.border }}>
          <span style={{ color:C.p6, fontWeight:700, fontSize:16 }}>{statusCounts.convertido||0}</span><span style={{ color:C.muted, fontSize:12 }}>clientes</span>
        </div>
        {sortedSegments.slice(0,5).map(([seg, count]) => (
          <div key={seg} style={{ background:C.white, borderRadius:20, padding:'8px 16px', display:'flex', alignItems:'center', gap:6, border:'1px solid '+C.border }}>
            <span style={{ fontSize:14 }}>{segIcons[seg]||'📌'}</span>
            <span style={{ color:C.ink, fontWeight:700, fontSize:16 }}>{count}</span>
          </div>
        ))}
      </div>

      {/* SEARCH + FILTERS BAR */}
      <div style={{ background:C.white, borderRadius:14, padding:16, marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', gap:12, marginBottom:14, alignItems:'center' }}>
          <div style={{ flex:1, position:'relative' }}>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome, segmento, bairro..." style={{ width:'100%', padding:'10px 14px 10px 36px', borderRadius:10, border:'1px solid '+C.border, background:C.bg, color:C.ink, fontSize:13, outline:'none', fontFamily:'DM Sans,sans-serif' }} />
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:C.muted }}>🔍</span>
          </div>
          <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, background:C.bg, color:C.ink, fontSize:12, outline:'none', cursor:'pointer' }}>
            <option value="Todos">Todos status</option>
            <option value="Novo">Novo</option>
            <option value="Contactado">Contactado</option>
            <option value="Qualificado">Qualificado</option>
            <option value="Convertido">Convertido</option>
            <option value="Perdido">Perdido</option>
          </select>
          {/* A ordenacao saiu daqui e foi pro cabecalho da tabela, onde a
              coluna esta. No lugar, o que faltava: sair de um filtro. */}
          {filtrosAtivos > 0 ? (
            <button onClick={limparFiltros} title="Voltar a ver todos os leads"
              style={{ padding:'10px 16px', borderRadius:10, border:'1px solid '+C.p1, background:C.p1+'14', color:C.p1, fontSize:12, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}>
              ✕ Limpar {filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''}
            </button>
          ) : null}
          <button onClick={exportCSV} style={{ padding:'10px 16px', borderRadius:10, border:'1px solid '+C.border, background:C.bg, color:C.ink, fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>⬇ CSV</button>
          <button onClick={()=>setImportOpen(true)} title="Importar leads de uma planilha (Excel salvo como CSV)" style={{ padding:'10px 16px', borderRadius:10, border:'none', background:C.p1, color:'#fff', fontSize:12, cursor:'pointer', fontWeight:700, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>📥 Importar planilha</button>
        </div>

        {/* SEGMENT CHIPS */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
          <button onClick={()=>setFiltroSegmento('TODOS')} style={{ padding:'6px 14px', borderRadius:20, border:'1px solid '+(filtroSegmento==='TODOS'?C.p1:C.border), background:filtroSegmento==='TODOS'?C.p1:'transparent', color:filtroSegmento==='TODOS'?'#fff':C.ink, cursor:'pointer', fontSize:12, fontWeight:600 }}>TODOS {leads.length}</button>
          {sortedSegments.map(([seg, count]) => (
            <button key={seg} onClick={()=>setFiltroSegmento(seg===filtroSegmento?'TODOS':seg)} style={{ padding:'6px 14px', borderRadius:20, border:'1px solid '+(filtroSegmento===seg?C.p1:C.border), background:filtroSegmento===seg?'rgba(255,107,53,0.1)':'transparent', color:filtroSegmento===seg?C.p1:C.ink, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
              <span>{segIcons[seg]||'📌'}</span><span>{seg}</span><span style={{ background:'rgba(0,0,0,0.08)', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{count}</span>
            </button>
          ))}
        </div>

        {/* CATEGORY CHIPS */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setFiltroCategoria('Todas')} style={{ padding:'4px 12px', borderRadius:16, border:'1px solid '+(filtroCategoria==='Todas'?C.p1:C.border), background:filtroCategoria==='Todas'?C.p1:'transparent', color:filtroCategoria==='Todas'?'#fff':C.muted, cursor:'pointer', fontSize:11 }}>Todas {leads.length}</button>
          {sortedCategories.map(([cat, count]) => (
            <button key={cat} onClick={()=>setFiltroCategoria(cat===filtroCategoria?'Todas':cat)} style={{ padding:'4px 12px', borderRadius:16, border:'1px solid '+(filtroCategoria===cat?C.p1:C.border), background:filtroCategoria===cat?'rgba(255,107,53,0.08)':'transparent', color:filtroCategoria===cat?C.p1:C.muted, cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
              <span>{catIcons[cat]||'🔹'}</span><span>{cat}</span><span style={{ fontWeight:700 }}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div style={{ background:C.white, borderRadius:14, padding:4, overflowX:'auto', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, color:C.ink }}>
          <thead>
            <tr style={{ borderBottom:'2px solid '+C.border }}>
              <ThLead rot="NOME" campo="name" ativo={!!fNome} ctx={thCtx}>
                <input autoFocus value={fNome} onChange={e=>setFNome(e.target.value)} placeholder="Buscar no nome…"
                  style={filtroInput} />
              </ThLead>
              <ThLead rot="CIDADE" campo="city" ativo={fCidade!=='Todas'} ctx={thCtx}>
                <OpcoesFiltro valor={fCidade} onPick={setFCidade} fechar={()=>setMenuCol(null)}
                  opcoes={[['Todas','Todas as cidades', leads.length]].concat(
                    Object.entries(cidades).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,k,v]))} />
              </ThLead>
              <ThLead rot="SEGMENTO" campo="segment" ativo={filtroSegmento!=='TODOS'} ctx={thCtx}>
                <OpcoesFiltro valor={filtroSegmento} onPick={setFiltroSegmento} fechar={()=>setMenuCol(null)}
                  opcoes={[['TODOS','Todos os segmentos', leads.length]].concat(
                    Object.entries(segments).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,k,v]))} />
              </ThLead>
              <ThLead rot="CATEGORIA" campo="category" ativo={filtroCategoria!=='Todas'} ctx={thCtx}>
                <OpcoesFiltro valor={filtroCategoria} onPick={setFiltroCategoria} fechar={()=>setMenuCol(null)}
                  opcoes={[['Todas','Todas as categorias', leads.length]].concat(
                    Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,k,v]))} />
              </ThLead>
              <ThLead rot="RATING" campo="rating" ativo={fRating>0} ctx={thCtx}>
                <OpcoesFiltro valor={fRating} onPick={setFRating} fechar={()=>setMenuCol(null)}
                  opcoes={[[0,'Qualquer nota',null],[4.5,'4,5 ou mais',null],[4,'4,0 ou mais',null],[3,'3,0 ou mais',null]]} />
              </ThLead>
              <ThLead rot="TELEFONE" campo="phone" ativo={!!fTel} ctx={thCtx}>
                <input autoFocus value={fTel} onChange={e=>setFTel(e.target.value)} placeholder="Digitos do telefone…"
                  style={filtroInput} />
              </ThLead>
              <ThLead rot="PRIO." campo="priority" ativo={fPrio!=='Todas'} ctx={thCtx}>
                <OpcoesFiltro valor={fPrio} onPick={setFPrio} fechar={()=>setMenuCol(null)}
                  opcoes={[['Todas','Todas',null],['alta','Alta',null],['media','Média',null],['baixa','Baixa',null]]} />
              </ThLead>
              <ThLead rot="STATUS" campo="status" ativo={filtroStatus!=='Todos'} ctx={thCtx}>
                <OpcoesFiltro valor={filtroStatus} onPick={setFiltroStatus} fechar={()=>setMenuCol(null)}
                  opcoes={[['Todos','Todos', statusCounts.total]].concat(
                    ['novo','contactado','qualificado','convertido','perdido'].map(k =>
                      [k.charAt(0).toUpperCase()+k.slice(1), LEADS_STATUS_LABELS[k], statusCounts[k]]))} />
              </ThLead>
              <ThLead rot="AÇÃO" ctx={thCtx} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding:'30px 10px', color:C.muted, textAlign:'center' }}>Nenhum lead encontrado.</td></tr>
            )}
            {filtered.map((l, i) => {
              const sc = statusColor(l.status);
              const pc = prioColor(l.priority);
              const segColor = segColors[(l.segment||'').toUpperCase()] || C.muted;
              const stars = l.rating ? '★'.repeat(Math.min(5,Math.round(Number(l.rating)))) : '';
              return (
                <tr key={l.id || i} style={{ borderBottom:'1px solid '+C.border, transition:'background 0.15s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.02)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 10px' }}>
                    <div style={{ fontWeight:600, color:C.ink }}>{l.name || '—'}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{l.address || '—'}</div>
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    <div style={{ color:C.ink, fontSize:12 }}>{l.city || '—'}</div>
                    {l.neighborhood ? <div style={{ fontSize:11, color:C.muted }}>{l.neighborhood}</div> : null}
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    <StatusBadge status={(l.segment||'—').toUpperCase()} colorMap={LEAD_SEG_COLORS} labelMap={{}} />
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    <span style={{ background:'rgba(0,0,0,0.06)', color:C.ink, borderRadius:6, padding:'3px 10px', fontSize:11 }}>{l.category || '—'}</span>
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    <span style={{ color:'#f5a623' }}>{stars}</span>
                    <span style={{ color:C.ink, marginLeft:4 }}>{l.rating ? Number(l.rating).toFixed(1) : '—'}</span>
                    {l.review_count != null && <div style={{ fontSize:10, color:C.muted }}>({l.review_count})</div>}
                  </td>
                  <td style={{ padding:'12px 10px', color:l.phone ? C.p3 : C.muted }}>{l.phone || '—'}</td>
                  <td style={{ padding:'12px 10px' }}>
                    <span style={{ color:pc }}>● </span>
                    <span style={{ color:C.ink, textTransform:'capitalize' }}>{l.priority || '—'}</span>
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    <select value={l.status||'novo'} onChange={e=>updateStatus(l.id, e.target.value)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid '+C.border, background:C.bg, color:C.ink, fontSize:11, outline:'none', cursor:'pointer' }}>
                      <option value="novo">Novo</option>
                      <option value="contactado">Contactado</option>
                      <option value="qualificado">Qualificado</option>
                      <option value="convertido">Convertido</option>
                      <option value="perdido">Perdido</option>
                    </select>
                  </td>
                  <td style={{ padding:'12px 10px' }}>
                    {l.phone ? (
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <button onClick={()=>setAbordar(l)} title="Abordagem personalizada pelo numero da loja" style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                          <span>💬</span> Abordar
                        </button>
                        {/* Canal alternativo: abre no aparelho do operador. */}
                        <button onClick={()=>openWhatsApp(l.phone, l.name)} title="Abrir no MEU WhatsApp (nao usa o numero da loja)"
                          style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'5px 8px', cursor:'pointer', fontSize:12 }}>📱</button>
                      </div>
                    ) : <span style={{ color:C.muted }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ImportarPlanilhaModal open={importOpen} onClose={()=>setImportOpen(false)} onPronto={fetchLeads} existingLeads={leads} />
      {abordar ? (
        <AbordagemModal
          lead={abordar}
          onClose={()=>setAbordar(null)}
          onSent={()=>fetchLeads()}
        />
      ) : null}
    </div>
  );
};

// Status de orcamento — novo ciclo:
// pending -> rascunho -> enviado -> aprovado -> em_execucao -> concluido (+ recusado)
// Legacy: accepted/completed/rejected mantidos como sinonimos.
const QUOTE_STATUS = {
  pending:      { label: 'Aguardando',  cat: 'pending' },
  rascunho:     { label: 'Rascunho',    cat: 'pending' },
  enviado:      { label: 'Enviado',     cat: 'progress' },
  aprovado:     { label: 'Aprovado',    cat: 'progress' },
  em_execucao:  { label: 'Em execução', cat: 'progress' },
  concluido:    { label: 'Concluído',   cat: 'done' },
  recusado:     { label: 'Recusado',    cat: 'rejected' },
  // Legacy / backward compat
  accepted:     { label: 'Aceito',      cat: 'progress' },
  completed:    { label: 'Concluído',   cat: 'done' },
  rejected:     { label: 'Rejeitado',   cat: 'rejected' },
};
const quoteStatusInfo = (s) => QUOTE_STATUS[s] || { label: s || '—', cat: 'pending' };
// Cores por categoria: verde p/ concluido, azul p/ em andamento, cinza p/ pendente, vermelho p/ recusado
const QUOTE_STATUS_COLORS = {
  done:     { bg: C.p6 + '22', fg: C.p6 },        // verde
  progress: { bg: C.p3 + '22', fg: C.p3 },        // azul/turquesa
  pending:  { bg: C.p7 + '44', fg: '#b8860b' },   // amarelo/cinza
  rejected: { bg: C.p4 + '22', fg: C.p4 },        // vermelho
};
const quoteStatusStyle = (s) => {
  const info = quoteStatusInfo(s);
  const col = QUOTE_STATUS_COLORS[info.cat] || QUOTE_STATUS_COLORS.pending;
  return { background: col.bg, color: col.fg, borderRadius: 8, padding: '3px 10px', fontSize: 11 };
};
// Mantido por compat: STATUS_MAP[status] devolve so o label.
const STATUS_MAP = Object.fromEntries(Object.entries(QUOTE_STATUS).map(([k,v]) => [k, v.label]));

const Orcamentos = () => {
  const { data, loading } = useSupabaseQuery((sb) => sb
    .from('quotes')
    .select('*, client:profiles!client_id(name), painter:profiles!painter_id(name)')
    .order('created_at', { ascending: false }), []);
  const orcamentos = data || [];

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando orçamentos...</div>;

  return (
    <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight:700, marginBottom:16, color:C.ink }}>📋 Orçamentos</div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:'2px solid '+C.border }}>
            {['Cliente','Pintor','Serviço','Valor','Status','Data'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orcamentos.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '20px 12px', color: C.muted, textAlign: 'center' }}>Nenhum orçamento encontrado.</td></tr>
          )}
          {orcamentos.map((o, i) => {
            const stInfo = quoteStatusInfo(o.status);
            const data = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
            return (
              <tr key={o.id || i} style={{ borderBottom:'1px solid '+C.border }}>
                <td style={{ padding:'10px 12px' }}>{o.client?.name || '—'}</td>
                <td style={{ padding:'10px 12px' }}>{o.painter?.name || '—'}</td>
                <td style={{ padding:'10px 12px', color:C.muted }}>{o.service_type || o.title || '—'}</td>
                <td style={{ padding:'10px 12px', fontWeight:700 }}>{o.price != null ? 'R$ ' + Number(o.price).toLocaleString('pt-BR') : '—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  <span style={quoteStatusStyle(o.status)}>{stInfo.label}</span>
                </td>
                <td style={{ padding:'10px 12px', color:C.muted }}>{data}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ClientesList = () => {
  const { data, loading, refetch: fetchClientes } = useSupabaseQuery(async (sb) => {
    const profiles = await profilesService.list({ clienteOnly: true, order: 'created_at', ascending: false });
    // Load invite codes generated by each user
    const { data: invites } = await sb.from('invites').select('code, created_by').order('created_at', { ascending: false });
    const inviteMap = {};
    (invites || []).forEach(inv => {
      if (!inviteMap[inv.created_by]) inviteMap[inv.created_by] = [];
      inviteMap[inv.created_by].push(inv.code);
    });
    return profiles.map(p => ({ ...p, _generated_codes: inviteMap[p.id] || [] }));
  }, []);
  const clientes = data || [];
  const [selIds, setSelIds] = useState([]);
  const toggleSel = (id) => setSelIds(s => s.includes(id) ? s.filter(x => x !== id) : s.concat(id));
  const allSel = clientes.length > 0 && selIds.length === clientes.length;

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando clientes...</div>;

  return (
    <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>👥 Clientes Cadastrados ({clientes.length})</div>
      <CreateAppUserForm onCreated={fetchClientes} defaultRole="cliente" />
      <BulkDeleteBar list={clientes} selIds={selIds} setSelIds={setSelIds} after={fetchClientes} />
      {clientes.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum cliente cadastrado.</div>}
      <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:800 }}>
        {clientes.length > 0 && (
          <thead>
            <tr style={{ borderBottom:'2px solid '+C.border }}>
              <th style={{ padding:'8px 12px', width:34 }}>
                <input type="checkbox" checked={allSel} onChange={e => setSelIds(e.target.checked ? clientes.map(x => x.id) : [])} title="Selecionar todos" />
              </th>
              {['Nome','Tipo','@Tag','Email','Cidade','Estado','Cadastro','Codigo Gerado','Codigo Utilizado','PRO','Portal'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {clientes.map((c, i) => {
            const data = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
            return (
              <tr key={c.id || i} style={{ borderBottom:'1px solid '+C.border, background: selIds.includes(c.id) ? C.cream : 'transparent' }}>
                <td style={{ padding:'10px 12px' }}>
                  <input type="checkbox" checked={selIds.includes(c.id)} onChange={() => toggleSel(c.id)} />
                </td>
                <td style={{ padding:'10px 12px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <AvatarCell name={c.name} avatarUrl={c.avatar_url} size={32} />
                    <NameCell profile={c} after={fetchClientes} />
                  </div>
                </td>
                <td style={{ padding:'10px 12px' }}><RoleSelect profile={c} after={fetchClientes} /></td>
                <td style={{ padding:'10px 12px' }}><TagCell profile={c} after={fetchClientes} /></td>
                <td style={{ padding:'10px 12px', fontSize:12 }}><EmailCell profile={c} after={fetchClientes} /></td>
                <td style={{ padding:'10px 12px' }}><CityCell profile={c} after={fetchClientes} /></td>
                <td style={{ padding:'10px 12px' }}><StateCell profile={c} after={fetchClientes} /></td>
                <td style={{ padding:'10px 12px', color:C.muted }}>{data}</td>
                <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, fontWeight:700, letterSpacing:1 }}>{c._generated_codes && c._generated_codes.length > 0 ? c._generated_codes.join(', ') : '—'}</td>
                <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, fontWeight:700, letterSpacing:1 }}>{c.invite_code_used || '—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  <ProBadgeCell profile={c} onChange={fetchClientes} />
                </td>
                <td style={{ padding:'10px 12px' }}>
                  <PortalAccessCell profile={c} onChange={fetchClientes} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const PostsModeracao = () => {
  const [filter, setFilter] = useState('pending');
  const { data, loading, refetch: fetchPosts } = useSupabaseQuery((sb) => {
    let query = sb.from('posts').select('*, profiles!user_id(name, tag, avatar_url, role)').order('created_at', { ascending: false }).limit(50);
    if(filter === 'pending') query = query.eq('status','pending');
    else if(filter === 'rejected') query = query.eq('status','rejected');
    return query;
  }, [filter]);
  const posts = data || [];

  const updateStatus = async (id, status) => {
    try {
      await postsService.setStatus(id, status);
      fetchPosts();
    } catch (e) { alert('Erro ao atualizar post: ' + (e.message || e)); }
  };

  const deletePost = async (id) => {
    if(!confirm('Deletar permanentemente?')) return;
    try {
      await postsService.deleteWithChildren(id);
      fetchPosts();
    } catch (e) { alert('Erro ao deletar post: ' + (e.message || e)); }
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {['pending','rejected','all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:'8px 16px', borderRadius:8, border: filter===f?'2px solid '+C.p1:'1.5px solid '+C.border, background: filter===f?'rgba(255,107,53,0.08)':'#fff', color: filter===f?C.p1:C.ink, fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {f==='pending'?'⏳ Pendentes':f==='rejected'?'❌ Rejeitados':'📋 Todos'}
          </button>
        ))}
      </div>
      {loading && <div style={{ color:C.muted, padding:20 }}>Carregando...</div>}
      {!loading && posts.length===0 && <div style={{ color:C.muted, padding:20, textAlign:'center' }}>Nenhum post {filter==='pending'?'pendente':'encontrado'} 🎉</div>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
        {posts.map(p => {
          const prof = p.profiles || {};
          const isVideo = p.media_url && (p.media_url.includes('.mp4') || p.media_type === 'video');
          return (
            <div key={p.id} style={{ background:C.white, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border: p.status==='pending'?'2px solid #f0ad4e':p.status==='rejected'?'2px solid #e74c3c':'1px solid '+C.border }}>
              {p.media_url && (isVideo ?
                <video src={p.media_url} controls style={{ width:'100%', maxHeight:200, objectFit:'cover' }} /> :
                <img src={p.media_url} style={{ width:'100%', maxHeight:200, objectFit:'cover' }} />
              )}
              <div style={{ padding:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <img src={prof.avatar_url || 'https://ui-avatars.com/api/?name=U&size=32'} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{prof.name || 'User'}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{prof.tag ? '@'+prof.tag : ''} · {prof.role || 'cliente'}</div>
                  </div>
                  <span style={{ marginLeft:'auto' }}>
                    <StatusBadge status={p.status || 'pending'} colorMap={POSTS_STATUS_COLORS} labelMap={POSTS_STATUS_LABELS} />
                  </span>
                </div>
                {p.caption && <div style={{ fontSize:12, color:C.ink, marginBottom:8 }}>{p.caption}</div>}
                <div style={{ fontSize:10, color:C.muted, marginBottom:10 }}>{new Date(p.created_at).toLocaleString('pt-BR')}</div>
                <div style={{ display:'flex', gap:6 }}>
                  {p.status !== 'approved' && <button onClick={() => updateStatus(p.id, 'approved')} style={{ flex:1, padding:'6px 10px', background:'#28a745', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>✓ Aprovar</button>}
                  {p.status !== 'rejected' && <button onClick={() => updateStatus(p.id, 'rejected')} style={{ flex:1, padding:'6px 10px', background:'#ffc107', color:'#333', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>✗ Rejeitar</button>}
                  <button aria-label="Excluir post" onClick={() => deletePost(p.id)} style={{ padding:'6px 10px', background:'#dc3545', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AvaliacoesList = () => {
  const { data, loading } = useSupabaseQuery((sb) => sb
    .from('quotes')
    .select('*, client:profiles!client_id(name, rating_avg), painter:profiles!painter_id(name, rating_avg)')
    .order('created_at', { ascending: false }), []);
  const quotes = data || [];

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando avaliações...</div>;

  const rated = quotes.filter(q => q.painter?.rating_avg != null || q.client?.rating_avg != null);

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>⭐ Avaliações — Pintores</div>
        {quotes.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum orçamento encontrado para avaliar.</div>}
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          {quotes.length > 0 && (
            <thead>
              <tr style={{ borderBottom:'2px solid '+C.border }}>
                {['Pintor','Nota Média','Cliente','Serviço','Status','Data'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {quotes.map((q, i) => {
              const st = STATUS_MAP[q.status] || q.status;
              const data = q.created_at ? new Date(q.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '—';
              const rating = q.painter?.rating_avg;
              return (
                <tr key={q.id || i} style={{ borderBottom:'1px solid '+C.border }}>
                  <td style={{ padding:'10px 12px', fontWeight:600 }}>{q.painter?.name || '—'}</td>
                  <td style={{ padding:'10px 12px' }}>
                    {rating != null ? (
                      <span style={{ color:C.p1 }}>{'★'.repeat(Math.round(Number(rating)))}{'☆'.repeat(5-Math.round(Number(rating)))} {Number(rating).toFixed(1)}</span>
                    ) : <span style={{ color:C.muted }}>—</span>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>{q.client?.name || '—'}</td>
                  <td style={{ padding:'10px 12px', color:C.muted }}>{q.service_type || '—'}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ background:st==='aceito'?C.p6+'22':st==='pendente'?C.p7+'44':st==='concluido'?C.p3+'22':C.p4+'22', color:st==='aceito'?C.p6:st==='pendente'?'#b8860b':st==='concluido'?C.p3:C.p4, borderRadius:8, padding:'3px 10px', fontSize:11 }}>{st}</span>
                  </td>
                  <td style={{ padding:'10px 12px', color:C.muted }}>{data}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CursosList = () => {
  const { data, loading } = useSupabaseQuery((sb) => sb
    .from('profiles')
    .select('id, name, city, state, verified, rating_avg')
    .order('rating_avg', { ascending: false }), []);
  const profiles = (data || []).filter(p => p.verified);

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando cursos...</div>;

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: C.ink }}>📚 Cursos — Pintores Verificados</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Pintores verificados podem criar e vender cursos na plataforma.</div>
        {profiles.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum pintor verificado ainda. Aprove pintores na seção Pintores para habilitar cursos.</div>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {profiles.map((p, i) => (
            <div key={p.id || i} style={{ background:C.bg, borderRadius:12, padding:16, border:'1px solid '+C.border }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:C.p1+'22', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.p1, fontSize:14 }}>{(p.name || '?')[0]}</div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{p.name || 'Sem nome'}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{[p.city, p.state].filter(Boolean).join(', ')}</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:C.p1 }}>⭐ {p.rating_avg != null ? Number(p.rating_avg).toFixed(1) : '—'}</div>
              <div style={{ background:C.p6+'22', color:C.p6, borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600, display:'inline-block', marginTop:8 }}>✓ Verificado</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MarketingPage = () => {
  const { data, loading } = useSupabaseQuery(async (sb) => {
    const [pRes, lRes, qRes] = await Promise.all([
      sb.from('profiles').select('id', { count: 'exact', head: true }),
      sb.from('leads').select('id', { count: 'exact', head: true }),
      sb.from('quotes').select('id', { count: 'exact', head: true }),
    ]);
    return { data: { profiles: pRes.count || 0, leads: lRes.count || 0, quotes: qRes.count || 0 } };
  }, []);
  const stats = data || { profiles: 0, leads: 0, quotes: 0 };

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando marketing...</div>;

  const convRate = stats.profiles > 0 ? ((stats.quotes / stats.profiles) * 100).toFixed(1) : '0';

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Alcance (Perfis)" value={stats.profiles} sub="base total" trend="" color={C.p3} />
        <KPICard title="Leads Captados" value={stats.leads} sub="funil de entrada" trend="" color={C.p5} />
        <KPICard title="Taxa de Conversão" value={convRate + '%'} sub="perfis → orçamentos" trend="" color={C.p1} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight:700, marginBottom:12, color:C.ink }}>📣 Funil de Marketing</div>
          {[
            { label:'Perfis cadastrados', value:stats.profiles, pct:100 },
            { label:'Leads captados', value:stats.leads, pct: stats.profiles ? Math.round(stats.leads/stats.profiles*100) : 0 },
            { label:'Orçamentos gerados', value:stats.quotes, pct: stats.profiles ? Math.round(stats.quotes/stats.profiles*100) : 0 },
          ].map((s,i) => (
            <div key={i} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:13 }}>{s.label}</span>
                <span style={{ fontSize:13, fontWeight:700 }}>{s.value}</span>
              </div>
              <div style={{ background:C.border, borderRadius:4, height:8 }}>
                <div style={{ background:C.p1, height:8, borderRadius:4, width:Math.min(Math.max(s.pct,2),100)+'%' }}></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:C.white, borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight:700, marginBottom:12, color:C.ink }}>💡 Insights</div>
          <div style={{ fontSize:13, color:C.ink, lineHeight:1.8 }}>
            <div style={{ padding:'8px 0', borderBottom:'1px solid '+C.border }}>📊 <b>{stats.profiles}</b> perfis na base</div>
            <div style={{ padding:'8px 0', borderBottom:'1px solid '+C.border }}>🧲 <b>{stats.leads}</b> leads captados</div>
            <div style={{ padding:'8px 0', borderBottom:'1px solid '+C.border }}>📋 <b>{stats.quotes}</b> orçamentos solicitados</div>
            <div style={{ padding:'8px 0' }}>📈 Taxa de conversão: <b>{convRate}%</b></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══ AVISOS (Announcements) ══
const Avisos = () => {
  const { data, loading, refetch: loadAvisos } = useSupabaseQuery((sb) => sb
    .from('announcements').select('*').order('created_at', { ascending: false }), []);
  const avisos = data || [];
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const saveAviso = async () => {
    if(!title.trim()){ alert('Preencha o titulo'); return; }
    if(!message.trim()){ alert('Preencha a mensagem'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supa.auth.getSession();
      await announcementsService.insert({
        title: title.trim(),
        message: message.trim(),
        active: true,
        created_by: session?.user?.id || null,
        created_at: new Date().toISOString()
      });
      setTitle(''); setMessage('');
      loadAvisos();
    } catch(e){ alert('Erro: ' + (e.message || 'tente novamente')); }
    setSaving(false);
  };

  const toggleAviso = async (id, active) => {
    try {
      // active recebido eh o estado atual; toggle = !active
      await announcementsService.toggle(id, !active);
      loadAvisos();
    } catch(e){ console.warn('toggleAviso error:', e); }
  };

  const deleteAviso = async (id) => {
    if(!confirm('Tem certeza que deseja excluir este aviso?')) return;
    try {
      await announcementsService.remove(id);
      loadAvisos();
    } catch(e){ console.warn('deleteAviso error:', e); }
  };

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>📢 Criar Novo Aviso</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Titulo</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Promocao de tintas" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Mensagem</div>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escreva o conteudo do aviso..." rows={3} style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none', resize:'vertical', fontFamily:'DM Sans, sans-serif' }} />
        </div>
        <button disabled={saving} onClick={saveAviso} style={{ padding:'10px 24px', background:C.p1, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer' }}>
          {saving ? 'Salvando...' : 'Publicar Aviso'}
        </button>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Este aviso aparecera na aba de notificacoes do app para todos os usuarios.</div>
      </div>

      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>Avisos Publicados</div>
        {loading && <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>}
        {!loading && avisos.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum aviso publicado ainda.</div>}
        {avisos.map(a => (
          <div key={a.id} style={{ borderBottom:'1px solid '+C.border, padding:'14px 0', display:'flex', alignItems:'flex-start', gap:12 }}>
            <div style={{ fontSize: 24 }}>{a.active ? '📢' : '🔇'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: a.active ? C.ink : C.muted }}>{a.title}</div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>toggleAviso(a.id, a.active)} style={{ background: a.active ? C.p7+'33' : C.p6+'33', border:'none', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:600, cursor:'pointer', color: a.active ? '#b8860b' : C.p6 }}>
                {a.active ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={()=>deleteAviso(a.id)} style={{ background:C.p4+'22', border:'none', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:600, cursor:'pointer', color:C.p4 }}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ══ PEDIDOS DA LOJA (Orders) ══
const PedidosLoja = () => {
  // Busca em 2 passos (sem embed PostgREST `profiles!user_id`): a FK de
  // orders.user_id aponta pra auth.users, não pra profiles, então o embed
  // quebrava a query inteira e a tela ficava "Nenhum pedido recebido".
  // RLS (orders_admin_view = is_portal_admin) continua filtrando.
  const { data, loading, refetch } = useSupabaseQuery(async (sb) => {
    const { data: rows, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return { error };
    const list = rows || [];
    const userIds = [...new Set(list.map((o) => o.user_id).filter(Boolean))];
    const pmap = {};
    if (userIds.length) {
      const { data: profs } = await sb
        .from('profiles')
        .select('id, name, phone, city, state, tag')
        .in('id', userIds);
      (profs || []).forEach((p) => { pmap[p.id] = p; });
    }
    return { data: list.map((o) => ({ ...o, user: pmap[o.user_id] || null })) };
  }, []);
  const orders = data || [];
  const [detailOrder, setDetailOrder] = React.useState(null);
  const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

  const updateOrderStatus = async (id, status) => {
    try {
      await ordersService.updateStatus(id, status);
      refetch();
    } catch(e){ alert('Não foi possível atualizar o pedido: ' + (e.message || e)); console.warn('updateOrderStatus error:', e); }
  };

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>🛒 Pedidos da Loja</div>
        {loading && <div style={{ color: C.muted, fontSize: 13 }}>Carregando pedidos...</div>}
        {!loading && orders.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum pedido recebido ainda.</div>}
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          {orders.length > 0 && (
            <thead>
              <tr style={{ borderBottom:'2px solid '+C.border }}>
                {['Cliente','Telefone','Itens','Total','Status','Data','Acoes'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {orders.map((o, i) => {
              const user = o.user || {};
              const items = o.items || [];
              const st = o.status || 'pending';
              const data = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
              return (
                <tr key={o.id || i} onClick={() => setDetailOrder(o)} style={{ borderBottom:'1px solid '+C.border, cursor:'pointer' }}>
                  <td style={{ padding:'10px 12px', fontWeight:600 }}>{user.name || '—'}{user.tag ? ' @'+user.tag : ''}</td>
                  <td style={{ padding:'10px 12px', color:C.muted }}>{user.phone || '—'}</td>
                  <td style={{ padding:'10px 12px', maxWidth:280 }}>
                    {items.length ? items.map((it, idx) => (
                      <div key={idx} style={{ lineHeight:1.35 }}>
                        <span style={{ fontWeight:600 }}>{(Number(it.qty)||1)}×</span> {it.name || 'Item'}
                        {it.volume ? <span style={{ color:C.muted }}> · {it.volume}</span> : null}
                      </div>
                    )) : '—'}
                  </td>
                  <td style={{ padding:'10px 12px', fontWeight:700, color:C.p1 }}>R${Number(o.total||0).toFixed(2).replace('.',',')}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <StatusBadge status={st} colorMap={ORDERS_STATUS_COLORS} labelMap={ORDERS_STATUS_LABELS} />
                  </td>
                  <td style={{ padding:'10px 12px', color:C.muted }}>{data}</td>
                  <td style={{ padding:'10px 12px' }} onClick={e=>e.stopPropagation()}>
                    <select value={st} onChange={e=>updateOrderStatus(o.id, e.target.value)} style={{ padding:'4px 8px', borderRadius:8, border:'1px solid '+C.border, fontSize:12, cursor:'pointer' }}>
                      <option value="pending">Aguardando</option>
                      <option value="processing">Em andamento</option>
                      <option value="shipped">Enviado</option>
                      <option value="completed">Concluido</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {detailOrder && (() => {
        const o = detailOrder;
        const u = o.user || {};
        const its = o.items || [];
        const st = o.status || 'pending';
        const dt = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
        const hasPay = o.gateway || o.tx_id || o.paid_at || o.paid_amount != null;
        const sec = { fontWeight:700, fontSize:12, textTransform:'uppercase', color:C.muted, margin:'16px 0 6px', letterSpacing:0.4 };
        const row = (label, val) => (
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'4px 0', fontSize:13 }}>
            <span style={{ color:C.muted }}>{label}</span>
            <span style={{ fontWeight:600, textAlign:'right' }}>{val}</span>
          </div>
        );
        return (
          <div role="dialog" aria-modal="true" onClick={()=>setDetailOrder(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ background:C.white, borderRadius:16, padding:24, width:'100%', maxWidth:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:700, fontSize:16, color:C.ink }}>🛒 Pedido #{String(o.id||'').slice(0,8)}</div>
                <button onClick={()=>setDetailOrder(null)} aria-label="Fechar" style={{ border:'none', background:'transparent', fontSize:24, cursor:'pointer', color:C.muted, lineHeight:1 }}>×</button>
              </div>

              <div style={sec}>Cliente</div>
              {row('Nome', (u.name||'—') + (u.tag ? ' @'+u.tag : ''))}
              {row('Telefone', u.phone||'—')}
              {row('Cidade/UF', [u.city, u.state].filter(Boolean).join('/') || '—')}

              <div style={sec}>Itens</div>
              {its.length ? its.map((it, idx) => {
                const q = Number(it.qty)||1; const unit = Number(it.price)||0;
                return (
                  <div key={idx} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', borderBottom:'1px solid '+C.border, fontSize:13 }}>
                    <span><span style={{ fontWeight:600 }}>{q}×</span> {it.name||'Item'}{it.volume ? <span style={{ color:C.muted }}> · {it.volume}</span> : null}</span>
                    <span style={{ whiteSpace:'nowrap', textAlign:'right' }}>{brl(unit)} <span style={{ color:C.muted, fontSize:11 }}>= {brl(unit*q)}</span></span>
                  </div>
                );
              }) : <div style={{ color:C.muted, fontSize:13 }}>—</div>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', fontWeight:700, fontSize:15 }}>
                <span>Total</span><span style={{ color:C.p1 }}>{brl(o.total)}</span>
              </div>

              <div style={sec}>Pedido</div>
              {row('Data', dt)}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'4px 0' }}>
                <span style={{ color:C.muted, fontSize:13 }}>Status</span>
                <select value={st} onChange={e=>{ updateOrderStatus(o.id, e.target.value); setDetailOrder(null); }} style={{ padding:'4px 8px', borderRadius:8, border:'1px solid '+C.border, fontSize:12, cursor:'pointer' }}>
                  <option value="pending">Aguardando</option>
                  <option value="processing">Em andamento</option>
                  <option value="shipped">Enviado</option>
                  <option value="completed">Concluido</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>

              <div style={sec}>Pagamento</div>
              {hasPay ? (
                <>
                  {row('Gateway', o.gateway||'—')}
                  {row('Transação', o.tx_id||'—')}
                  {row('Valor pago', o.paid_amount!=null ? brl(o.paid_amount) : '—')}
                  {row('Método', o.payment_method||'—')}
                  {row('Pago em', o.paid_at ? new Date(o.paid_at).toLocaleString('pt-BR') : '—')}
                  {o.receipt_url ? <a href={o.receipt_url} target="_blank" rel="noreferrer" style={{ color:C.p1, fontSize:13 }}>Ver comprovante</a> : null}
                </>
              ) : (
                <div style={{ color:C.muted, fontSize:13, fontStyle:'italic' }}>Aguardando pagamento / contato (pagamento online ainda não ativado).</div>
              )}

              <div style={sec}>Entrega</div>
              <div style={{ color:C.muted, fontSize:13, fontStyle:'italic' }}>
                {o.shipping_address || 'Endereço não informado (captura no checkout ainda não implementada).'}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const PortalUsersList = () => {
  const { data, loading, refetch: fetchUsers } = useSupabaseQuery(() => profilesService
    .list({ portalOnly: true, order: 'created_at', ascending: false }), []);
  const users = data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMsg, setFormMsg] = useState('');

  const createUser = async () => {
    setFormError(''); setFormMsg('');
    const name = form.name.trim(), email = form.email.trim(), password = form.password;
    if (!email || !password) { setFormError('Email e senha sao obrigatorios'); return; }
    if (password.length < 8) { setFormError('Senha deve ter no minimo 8 caracteres'); return; }
    setSaving(true);
    try {
      const tag = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '') + '_' + Math.random().toString(36).slice(2, 7);
      const res = await authService.signUpAppUser({
        name: name || email,
        email,
        password,
        role: 'admin',
        portalAccess: true,
        userMetadata: { role: 'admin', tag },
        extraProfile: { email, tag }
      });
      if (!res.ok) { setFormError(res.error || 'Erro ao criar usuario'); return; }
      setFormMsg('Usuario criado com sucesso. Ele ja pode entrar no portal com essas credenciais.');
      setForm({ name:'', email:'', password:'' });
      setShowForm(false);
      fetchUsers();
    } catch (e) {
      setFormError(e.message || 'Erro ao criar usuario');
    } finally {
      setSaving(false);
    }
  };

  const revokeAccess = async (id) => {
    if (!confirm('Remover o acesso ao portal deste usuario?')) return;
    if (await adminUsers({ action:'revoke', userId:id })) fetchUsers();
  };

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando usuarios do portal...</div>;

  return (
    <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: C.ink }}>🔐 Usuarios com acesso ao Portal ({users.length})</div>
        <button onClick={() => { setShowForm(!showForm); setFormError(''); setFormMsg(''); }} style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
          {showForm ? 'Cancelar' : '+ Criar usuario'}
        </button>
      </div>

      {showForm && (
        <div style={{ background:C.cream, borderRadius:12, padding:16, marginBottom:20, border:'1px solid '+C.border }}>
          <div style={{ fontWeight:700, color:C.ink, marginBottom:12, fontSize:14 }}>Criar novo usuario do portal</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Nome</div>
              <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Nome (opcional)" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Email</div>
              <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="email@exemplo.com" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
            </div>
          </div>
          <div style={{ marginBottom:12, maxWidth:'50%' }}>
            <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Senha</div>
            <input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} placeholder="Minimo 6 caracteres" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
          </div>
          {formError && <div style={{ color:'#e63946', fontSize:13, marginBottom:10 }}>{formError}</div>}
          <button disabled={saving} onClick={createUser} style={{ background:C.p6, color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', cursor: saving?'wait':'pointer', fontSize:13, fontWeight:700 }}>
            {saving ? 'Criando...' : 'Criar usuario'}
          </button>
        </div>
      )}
      {formMsg && <div style={{ color:'#2e7d32', fontSize:13, marginBottom:16, background:C.p6+'15', padding:'10px 14px', borderRadius:10 }}>{formMsg}</div>}

      {users.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum usuario com acesso ao portal.</div>}
      {users.length > 0 && (
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:600 }}>
          <thead>
            <tr style={{ borderBottom:'2px solid '+C.border }}>
              {['Nome','Email','Papel','PRO','Criado em','Acoes'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom:'1px solid '+C.border }}>
                <td style={{ padding:'10px 12px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <AvatarCell name={u.name} avatarUrl={u.avatar_url} size={32} />
                    <NameCell profile={u} after={fetchUsers} />
                  </div>
                </td>
                <td style={{ padding:'10px 12px', fontSize:12 }}><EmailCell profile={u} after={fetchUsers} /></td>
                <td style={{ padding:'10px 12px' }}><span style={{ background:C.p5+'22', color:C.p5, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{u.role || u.user_type || 'admin'}</span></td>
                <td style={{ padding:'10px 12px' }}>
                  <ProBadgeCell profile={u} onChange={fetchUsers} />
                </td>
                <td style={{ padding:'10px 12px', color:C.muted, fontSize:12 }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  <button onClick={() => revokeAccess(u.id)} style={{ background:'none', border:'1px solid '+C.border, borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, color:C.p4 }}>Revogar acesso</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MODERAÇÃO — denúncias feitas por usuários (tabela `reports`)
// ============================================================
const Moderacao = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supa.from('reports')
        .select('id, reporter_id, post_id, target_user_id, reason, status, created_at, reporter:profiles!reporter_id(name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error: err } = await q;
      if (err) throw err;
      setReports(data || []);
    } catch (e) {
      console.warn('Moderacao fetchReports:', e);
      setError(e.message || 'Erro ao carregar denúncias');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [filter]);

  const resolveReport = async (id) => {
    try {
      await reportsService.resolve(id);
      fetchReports();
    } catch (e) {
      console.warn('resolveReport error:', e);
      alert('Não foi possível resolver: ' + (e.message || e));
    }
  };

  // Se a tabela `reports` não existir (erro 404/42P01), mostra placeholder.
  const tableMissing = error && /relation .*reports.* does not exist|404|42P01/i.test(error);

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: C.ink }}>🛡️ Moderação — Denúncias</div>
          <div style={{ display:'flex', gap:8 }}>
            {['pending','resolved','dismissed','all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding:'6px 14px', borderRadius:20, border:'1px solid '+(filter===f?C.p1:C.border), background:filter===f?C.p1:'transparent', color:filter===f?'#fff':C.ink, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                {f==='pending'?'Pendentes':f==='resolved'?'Resolvidas':f==='dismissed'?'Descartadas':'Todas'}
              </button>
            ))}
          </div>
        </div>
        {loading && <div style={{ color: C.muted, padding: 20 }}>Carregando denúncias...</div>}
        {!loading && tableMissing && (
          <div style={{ color: C.muted, padding: 20, textAlign:'center' }}>Sem denúncias</div>
        )}
        {!loading && !tableMissing && reports.length === 0 && (
          <div style={{ color: C.muted, padding: 20, textAlign:'center' }}>Sem denúncias</div>
        )}
        {!loading && !tableMissing && reports.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid '+C.border }}>
                {['ID','Denunciante','Alvo','Motivo','Status','Data','Ações'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const data = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' + new Date(r.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '—';
                const targetType = r.post_id ? 'post' : (r.target_user_id ? 'usuário' : '—');
                const targetId = r.post_id || r.target_user_id || '—';
                const targetIdShort = typeof targetId === 'string' && targetId.length > 8 ? targetId.slice(0,8) + '…' : targetId;
                const idShort = r.id ? String(r.id).slice(0,8) + '…' : '—';
                const st = r.status || 'pending';
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid '+C.border }}>
                    <td style={{ padding:'10px 12px', color:C.muted, fontSize:11, fontFamily:'monospace' }}>{idShort}</td>
                    <td style={{ padding:'10px 12px' }}>{r.reporter?.name || (r.reporter_id ? String(r.reporter_id).slice(0,8) + '…' : '—')}</td>
                    <td style={{ padding:'10px 12px', fontSize:12 }}>
                      <div style={{ fontWeight:600 }}>{targetType}</div>
                      <div style={{ color:C.muted, fontSize:11, fontFamily:'monospace' }}>{targetIdShort}</div>
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:12, maxWidth:240 }}>{r.reason || '—'}</td>
                    <td style={{ padding:'10px 12px' }}><StatusBadge status={st} colorMap={REPORTS_STATUS_COLORS} labelMap={REPORTS_STATUS_LABELS} /></td>
                    <td style={{ padding:'10px 12px', color:C.muted, fontSize:12 }}>{data}</td>
                    <td style={{ padding:'10px 12px' }}>
                      {st === 'pending' ? (
                        <button onClick={() => resolveReport(r.id)} style={{ background:C.p6, border:'none', color:'#fff', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Resolver</button>
                      ) : (
                        <span style={{ color:C.muted, fontSize:11 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================
// INDICAÇÕES — referrals + points
// ============================================================
const Indicacoes = () => {
  const [referrals, setReferrals] = useState([]);
  const [pointsTotal, setPointsTotal] = useState(0);
  const [topReferrers, setTopReferrers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = supa;
        const [refsRes, ptsRes] = await Promise.all([
          sb.from('referrals')
            .select('id, referrer_id, referred_id, status, bonus_points, created_at, referrer:profiles!referrer_id(name, avatar_url), referred:profiles!referred_id(name, avatar_url)')
            .order('created_at', { ascending: false })
            .limit(500),
          sb.from('points').select('amount, user_id, type'),
        ]);
        const refs = refsRes.data || [];
        const pts = ptsRes.data || [];
        setReferrals(refs);
        // Total de pontos creditados (type === 'earned' ou amount positivo)
        const total = pts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        setPointsTotal(total);
        // Top 5 indicadores
        const counts = {};
        refs.forEach(r => {
          if (!r.referrer_id) return;
          if (!counts[r.referrer_id]) counts[r.referrer_id] = { id: r.referrer_id, name: r.referrer?.name || '—', count: 0, bonus: 0 };
          counts[r.referrer_id].count += 1;
          counts[r.referrer_id].bonus += Number(r.bonus_points) || 0;
        });
        const top = Object.values(counts).sort((a,b) => b.count - a.count).slice(0, 5);
        setTopReferrers(top);
      } catch (e) {
        console.warn('Indicacoes load error:', e);
        setReferrals([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando indicações...</div>;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total de Indicações" value={referrals.length} sub="histórico completo" trend="🔗" color={C.p1} />
        <KPICard title="Pontos Creditados" value={pointsTotal.toLocaleString('pt-BR')} sub="soma de todos os pontos" trend="⭐" color={C.p7} />
        <KPICard title="Indicadores Únicos" value={topReferrers.length} sub="pessoas que indicaram" trend="👥" color={C.p5} />
      </div>

      {/* Top 5 */}
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: C.ink }}>🏆 Top 5 Indicadores</div>
        {topReferrers.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhum indicador ainda.</div>}
        {topReferrers.map((t, i) => (
          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom: i < topReferrers.length - 1 ? '1px solid '+C.border : 'none' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:C.p1+'22', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:C.p1 }}>{i+1}</div>
            <div style={{ flex:1, fontWeight:600, fontSize:13 }}>{t.name}</div>
            <div style={{ fontSize:12, color:C.muted }}>{t.count} indicaç{t.count===1?'ão':'ões'}</div>
            <div style={{ fontSize:12, color:C.p7, fontWeight:700, minWidth:80, textAlign:'right' }}>+{t.bonus} pts</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>🔗 Indicações</div>
        {referrals.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhuma indicação registrada.</div>}
        {referrals.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid '+C.border }}>
                {['Indicador','Indicado','Status','Pontos','Data'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.map(r => {
                const data = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
                const st = r.status || 'pending';
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid '+C.border }}>
                    <td style={{ padding:'10px 12px', fontWeight:600 }}>{r.referrer?.name || '—'}</td>
                    <td style={{ padding:'10px 12px' }}>{r.referred?.name || '—'}</td>
                    <td style={{ padding:'10px 12px' }}><StatusBadge status={st} colorMap={REFERRALS_STATUS_COLORS} labelMap={REFERRALS_STATUS_LABELS} /></td>
                    <td style={{ padding:'10px 12px', fontWeight:700, color:C.p7 }}>{r.bonus_points != null ? '+' + r.bonus_points : '—'}</td>
                    <td style={{ padding:'10px 12px', color:C.muted, fontSize:12 }}>{data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================
// AVALIAÇÕES — reviews (join com quotes/profiles)
// ============================================================
const AvaliacoesTab = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = supa;
        // Busca reviews + reviewer (cliente). Para descobrir o pintor avaliado,
        // faz join com quotes pelo quote_id.
        const { data, error } = await sb.from('reviews')
          .select('id, reviewer_id, quote_id, rating, criteria, comment, created_at, reviewer:profiles!reviewer_id(name, avatar_url), quote:quotes!quote_id(id, painter:profiles!painter_id(name, avatar_url, rating_avg))')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        setReviews(data || []);
      } catch (e) {
        console.warn('AvaliacoesTab load error:', e);
        setReviews([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = reviews.length;
  const avg = React.useMemo(
    () => total ? (reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) : 0,
    [reviews, total]
  );

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Carregando avaliações...</div>;

  const stars = (v) => {
    const n = Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, marginBottom:24 }}>
        <KPICard title="Total de Avaliações" value={total} sub="enviadas pelos clientes" trend="⭐" color={C.p1} />
        <KPICard title="Média Geral" value={total ? avg.toFixed(2) : '—'} sub={total ? stars(avg) : 'sem avaliações ainda'} trend="" color={C.p7} />
      </div>

      <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, color: C.ink }}>⭐ Avaliações dos Pintores</div>
        {reviews.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nenhuma avaliação registrada.</div>}
        {reviews.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid '+C.border }}>
                {['Pintor','Cliente','Nota','Critérios','Comentário','Data'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.muted, fontWeight:600, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => {
                const data = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
                const painterName = r.quote?.painter?.name || '—';
                const reviewerName = r.reviewer?.name || '—';
                const crits = Array.isArray(r.criteria) ? r.criteria : (r.criteria ? [r.criteria] : []);
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid '+C.border, verticalAlign:'top' }}>
                    <td style={{ padding:'10px 12px', fontWeight:600 }}>{painterName}</td>
                    <td style={{ padding:'10px 12px' }}>{reviewerName}</td>
                    <td style={{ padding:'10px 12px', color:C.p1, whiteSpace:'nowrap' }}>{stars(r.rating)} <span style={{ color:C.muted, fontSize:11 }}>{Number(r.rating || 0).toFixed(1)}</span></td>
                    <td style={{ padding:'10px 12px' }}>
                      {crits.length === 0 ? <span style={{ color:C.muted, fontSize:11 }}>—</span> : (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {crits.map((c, i) => (
                            <span key={i} style={{ background:C.p3 + '22', color:C.p3, borderRadius:8, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{c}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'10px 12px', fontSize:12, maxWidth:280, color:C.ink }}>{r.comment || <span style={{ color:C.muted }}>—</span>}</td>
                    <td style={{ padding:'10px 12px', color:C.muted, fontSize:12, whiteSpace:'nowrap' }}>{data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── WhatsApp (Evolution API, numero secundario +55 11 92072-5935) ──
// Estilo WhatsApp Web: coluna esquerda = uma conversa por numero (nome do
// perfil do app quando o telefone casa, senao o nome do WhatsApp/numero);
// direita = balões + campo de resposta. Le direto de whatsapp_messages
// (RLS libera SELECT pra portal admin); envia pela rota /api/whatsapp/send
// (que despacha pra Evolution). Poll de 15s, igual as demais telas.
// Formata SO numero brasileiro no padrao (DD) 9xxxx-xxxx. Numero de outro
// pais (ex.: EUA 16503154274) fica como +DDI... — antes o codigo tirava o
// '55' de qualquer numero e exibia um DDD brasileiro que nao existe.
const fmtWaPhone = (d) => {
  if(!d) return '';
  if(d.startsWith('55') && (d.length === 12 || d.length === 13)){
    const n = d.slice(2);
    if(n.length === 11) return '(' + n.slice(0,2) + ') ' + n.slice(2,7) + '-' + n.slice(7);
    if(n.length === 10) return '(' + n.slice(0,2) + ') ' + n.slice(2,6) + '-' + n.slice(6);
  }
  if(d.startsWith('1') && d.length === 11){ // EUA/Canada
    return '+1 (' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
  }
  return '+' + d;
};
const waHora = (m) => {
  const iso = m.wa_timestamp || m.created_at;
  if(!iso) return '';
  const dt = new Date(iso);
  const hoje = new Date();
  const mesmoDia = dt.toDateString() === hoje.toDateString();
  return mesmoDia
    ? dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    : dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
};

// Evolution API no Render FREE: dorme apos ~15min sem request e a primeira
// request depois disso leva ~50s. A aba mantem o servidor aquecido em vez de
// pagar esse cold start na hora do envio.
const EVO_BASE_URL = 'https://evolution-api-8arv.onrender.com';
const EVO_WARM_TTL = 5 * 60 * 1000;   // ping recente = servidor comprovadamente de pe
const EVO_WARM_EVERY = 5 * 60 * 1000; // cutucada periodica com a aba aberta

// Balaozinho de ajuda: um "?" discreto que abre a explicacao ao passar o
// mouse (e no clique, pra quem esta no celular/tablet). Existe porque o
// nome do botao nunca cabe a explicacao inteira — e o custo de errar em
// "Rodar follow-up" e mandar mensagem pra cliente de verdade.
const Ajuda = ({ titulo, itens, largura }) => {
  const [aberto, setAberto] = useState(false);
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}
      onMouseEnter={()=>setAberto(true)} onMouseLeave={()=>setAberto(false)}>
      <button type="button" onClick={()=>setAberto(a=>!a)} aria-label="Ajuda"
        style={{ width:19, height:19, borderRadius:'50%', border:'1px solid '+C.border, background:'#fff',
          color:C.muted, fontSize:11, fontWeight:800, lineHeight:'17px', textAlign:'center',
          cursor:'help', padding:0, flexShrink:0 }}>?</button>
      {aberto ? (
        <div style={{ position:'absolute', top:26, right:0, zIndex:60, width: largura || 360,
          background:'#fff', border:'1px solid '+C.border, borderRadius:12,
          boxShadow:'0 10px 34px rgba(26,26,46,.18)', padding:14, textAlign:'left',
          fontSize:12, lineHeight:1.5, color:C.ink, fontWeight:400, cursor:'default', whiteSpace:'normal' }}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:9 }}>{titulo}</div>
          {itens.map((it, i) => (
            <div key={i} style={{ marginBottom: i === itens.length - 1 ? 0 : 9 }}>
              <div style={{ fontWeight:700 }}>{it.t}</div>
              <div style={{ color:C.muted }}>{it.d}</div>
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
};

const AJUDA_WHATSAPP = [
  { t:'🕐 Só horário comercial ⟷ Responde 24h',
    d:'Se a IA atende a qualquer hora ou só das 8h às 19h de Brasília, sem domingo.' },
  { t:'💬 Auto-resposta',
    d:'Quando a IA NÃO vai responder (fora do horário ou com a chave desligada), o cliente recebe uma mensagem se apresentando, agradecendo e prometendo retorno — em vez de ficar sem resposta nenhuma. No máximo uma a cada 12h por conversa.' },
  { t:'🔁 Follow-up',
    d:'De hora em hora o sistema: cobra pendência parada há mais de 3h sem resposta sua, avisa o cliente UMA vez que o pedido está na fila, e dá um toque em quem sumiu há 48h (no máximo 1 por semana). Nunca fala com quem pediu PARE.' },
  { t:'👀 Simular follow-up',
    d:'Faz a varredura inteira e mostra o que ela FARIA — sem enviar nada a ninguém. É o ensaio, use à vontade.' },
  { t:'▶ Rodar follow-up agora',
    d:'Faz a varredura DE VERDADE, enviando as mensagens. No dia a dia não precisa: o sistema já roda sozinho de hora em hora. Serve só pra antecipar.' },
  { t:'Última varredura (linha de baixo)',
    d:'Quando rodou pela última vez, quantas conversas foram analisadas e o que saiu de cada tipo.' },
];

// Conteudo de uma bolha: foto, audio com player, video, documento ou
// texto. `url` chega assinada (bucket privado) — enquanto nao chega, ou
// se o arquivo nao foi salvo, mostra o marcador de sempre, entao nada
// quebra em mensagem antiga.
// Previa na lista de conversas: audio mostra a transcricao em vez de
// "[audio]" — da pra saber do que a conversa trata sem abrir.
const previewMsg = (m) => {
  if(!m) return '';
  if(m.transcript) return '🎤 ' + m.transcript;
  if(m.type === 'image') return '📷 ' + (m.body && m.body !== '[imagem]' ? m.body : 'Foto');
  if(m.type === 'audio') return '🎤 Áudio';
  if(m.type === 'video') return '🎬 Vídeo';
  if(m.type === 'document') return '📎 ' + (m.body || 'Documento');
  return m.body || '[' + (m.type || 'msg') + ']';
};

const BolhaConteudo = ({ m, url }) => {
  const tipo = m.type || 'text';
  const legenda = (m.body || '').trim();
  const marcador = /^\[(áudio|imagem|vídeo|figurinha|documento|msg|mensagem)\]$/i.test(legenda);
  const [aberta, setAberta] = useState(false);

  if(tipo === 'text' || !m.media_url) {
    return <span>{legenda || '[' + tipo + ']'}</span>;
  }
  if(!url) {
    return <span style={{ opacity:.75 }}>{legenda || '[' + tipo + ']'} <span style={{ fontSize:11 }}>· carregando…</span></span>;
  }

  if(tipo === 'image' || tipo === 'sticker') {
    return (
      <span>
        <img src={url} alt={legenda || 'imagem'} onClick={()=>setAberta(true)}
          style={{ display:'block', maxWidth:260, maxHeight:320, borderRadius:8, cursor:'zoom-in', objectFit:'cover' }} />
        {legenda && !marcador ? <div style={{ marginTop:6 }}>{legenda}</div> : null}
        {aberta ? (
          <span onClick={(e)=>{ e.stopPropagation(); setAberta(false); }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
            <img src={url} alt={legenda || 'imagem'} style={{ maxWidth:'92vw', maxHeight:'92vh', borderRadius:8 }} />
          </span>
        ) : null}
      </span>
    );
  }
  if(tipo === 'audio') {
    return (
      <span>
        <audio controls preload="none" src={url} style={{ display:'block', width:260, maxWidth:'100%' }} />
        {m.transcript ? (
          <div style={{ marginTop:6, fontSize:12, fontStyle:'italic', opacity:.85 }}>“{m.transcript}”</div>
        ) : (
          <div style={{ marginTop:4, fontSize:11, opacity:.7 }}>sem transcrição</div>
        )}
      </span>
    );
  }
  if(tipo === 'video') {
    return (
      <span>
        <video controls preload="metadata" src={url} style={{ display:'block', maxWidth:280, borderRadius:8 }} />
        {legenda && !marcador ? <div style={{ marginTop:6 }}>{legenda}</div> : null}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ color:'inherit', textDecoration:'underline' }}>
      📎 {legenda && !marcador ? legenda : 'Abrir documento'}
    </a>
  );
};

const WhatsAppTab = () => {
  const [msgs, setMsgs] = useState([]);
  const [profByPhone, setProfByPhone] = useState({});
  const [loading, setLoading] = useState(true);
  const [openWa, setOpenWa] = useState(null); // wa_id da conversa aberta
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [busca, setBusca] = useState('');
  const endRef = React.useRef(null);

  // PRE-AQUECIMENTO. Antes, quem pagava o cold start era o operador NA HORA
  // do envio ("Acordando o servidor…", ate 1min). Agora a aba cutuca o
  // servidor enquanto ele trabalha — ao abrir, a cada 5min, ao voltar pra
  // aba e ao comecar a digitar — e o envio sai sem espera nenhuma.
  // So conta como acordado quando a request VOLTA: falha de rede nao prova
  // que o servidor esta de pe.
  const warmRef = React.useRef(0);
  const warmingRef = React.useRef(null);
  const evoAquecido = () => Date.now() - warmRef.current < EVO_WARM_TTL;
  const aquecerEvolution = () => {
    if(warmingRef.current) return warmingRef.current;
    const p = fetch(EVO_BASE_URL, { mode:'no-cors', cache:'no-store' })
      .then(() => { warmRef.current = Date.now(); })
      .catch(() => {})
      .then(() => { warmingRef.current = null; });
    warmingRef.current = p;
    return p;
  };
  useEffect(() => {
    aquecerEvolution();
    const t = setInterval(aquecerEvolution, EVO_WARM_EVERY);
    const onVis = () => { if(document.visibilityState === 'visible' && !evoAquecido()) aquecerEvolution(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const WA_COLS = 'id, direction, wa_id, profile_name, type, body, template, media_url, media_mime, transcript, wa_timestamp, created_at';

  // MIDIA (Wave 49). O bucket e PRIVADO — conversa de cliente nao vira
  // link publico. Pedimos URL assinada em lote pras mensagens visiveis e
  // guardamos em memoria; a assinatura vale 1h, e recarregada no proximo
  // load. Sem isso seria uma chamada de rede por bolha.
  const [midiaUrls, setMidiaUrls] = useState({});   // path -> url assinada
  const assinandoRef = React.useRef({});
  const assinarMidias = async (paths) => {
    const novos = paths.filter(p => p && !midiaUrls[p] && !assinandoRef.current[p]);
    if(!novos.length) return;
    novos.forEach(p => { assinandoRef.current[p] = true; });
    try {
      const { data } = await supa.storage.from('whatsapp-media').createSignedUrls(novos, 3600);
      const map = {};
      (data || []).forEach(d => { if(d && d.path && d.signedUrl) map[d.path] = d.signedUrl; });
      if(Object.keys(map).length) setMidiaUrls(u => ({ ...u, ...map }));
    } catch(_){ /* sem assinatura a bolha cai no marcador de texto */ }
  };

  const load = async () => {
    const { data } = await supa
      .from('whatsapp_messages')
      .select(WA_COLS)
      .order('created_at', { ascending:false })
      .limit(500);
    if(data){
      // So troca o state se algo MUDOU de verdade — sem isso cada poll
      // recriava o array e a tela repintava (a "piscada").
      setMsgs(prev => {
        if(prev.length === data.length && prev.length > 0 && prev[0].id === data[0].id) return prev;
        return data;
      });
    }
    setLoading(false);
  };

  // Quem e o dono do numero? Duas fontes, casadas pelos ULTIMOS 8 DIGITOS
  // (robusto a DDI, nono digito e formatacao):
  //   1. profiles — usuario cadastrado no app (tem @tag)
  //   2. leads    — contato da prospeccao (ainda nao e usuario)
  // Sem isso, conversa que a LOJA inicia fica so com o numero na tela: o
  // nome do WhatsApp (pushName) so chega quando a pessoa RESPONDE.
  const [leadByPhone, setLeadByPhone] = useState({});
  // Chave da IA por conversa (Wave 46) + alertas abertos do portal.
  const [iaState, setIaState] = useState({});   // wa_id → true/false
  const [iaWhy, setIaWhy] = useState({});       // wa_id → ultima decisao da IA
  // Ate quando o OPERADOR ja viu esta conversa. A IA responder NAO conta
  // como lida: quem precisa saber que chegou mensagem e a pessoa.
  const [readAt, setReadAt] = useState({});     // wa_id → ISO
  const [iaPadrao, setIaPadrao] = useState(false);
  const [alertas, setAlertas] = useState([]);

  const loadIa = async () => {
    // Config em tabela PROPRIA (Wave 47) — app_settings guarda segredo de
    // sistema e recusa escrita do portal, corretamente.
    const [st, cfg, al] = await Promise.all([
      supa.from('whatsapp_ai_state').select('wa_id, enabled, last_why, last_at, last_read_at').limit(2000),
      supa.from('whatsapp_ai_config')
        .select('hours, default_on, followup_on, away_on, last_sweep_at, last_sweep_note')
        .eq('id',1).maybeSingle(),
      supa.from('portal_alerts').select('id, kind, wa_id, title, body, created_at')
        .eq('resolved', false).order('created_at', { ascending:false }).limit(50),
    ]);
    const m = {}; const w = {}; const rd = {};
    (st.data || []).forEach(r => {
      if(r.last_read_at) rd[r.wa_id] = r.last_read_at;
      // enabled NULL (Wave 48) = "nunca foi decidido nesta conversa" →
      // segue o padrao global. Guardamos o valor CRU de proposito.
      m[r.wa_id] = r.enabled;
      if(r.last_why) w[r.wa_id] = { why: r.last_why, at: r.last_at };
    });
    setIaState(m); setIaWhy(w);
    // Nao sobrescreve marca local mais nova (upsert ainda em voo).
    setReadAt(prev => {
      const merged = { ...rd };
      Object.keys(prev).forEach(k => {
        if(!merged[k] || new Date(prev[k]) > new Date(merged[k])) merged[k] = prev[k];
      });
      return merged;
    });
    setIaPadrao(Boolean(cfg.data && cfg.data.default_on));
    setAlertas(al.data || []);
    setHoras((cfg.data && cfg.data.hours) || '8-19');
    setFollowupOn(!cfg.data || cfg.data.followup_on !== false);
    setAwayOn(!cfg.data || cfg.data.away_on !== false);
    setSweep(cfg.data ? { at: cfg.data.last_sweep_at, note: cfg.data.last_sweep_note } : null);
  };

  // Sem decisao propria (linha ausente ou enabled NULL), vale o padrao
  // global — mesma regra do servidor.
  const iaLigada = (waId) => (typeof iaState[waId] === 'boolean') ? iaState[waId] : iaPadrao;

  // Janela de atendimento da IA (app_settings 'whatsapp_ai_hours').
  // '0-24' = responde a qualquer hora; '8-19' = so comercial (padrao).
  const [horas, setHoras] = useState('8-19');
  const foraDeHorarioLiberado = horas.trim() === '0-24';
  const toggleForaDeHorario = async () => {
    const novo = foraDeHorarioLiberado ? '8-19' : '0-24';
    setHoras(novo); // otimista
    const { error } = await supa.from('whatsapp_ai_config')
      .upsert({ id:1, hours: novo, updated_at: new Date().toISOString() }, { onConflict:'id' });
    if(error){
      setHoras(foraDeHorarioLiberado ? '0-24' : '8-19');
      alert('Nao consegui salvar o horario da IA: ' + error.message);
    }
  };

  // FOLLOW-UP AUTOMATICO (Wave 48). Chave mestra + botao pra rodar na
  // hora. A varredura de verdade roda de hora em hora no banco (pg_cron);
  // aqui e so pra ver o resultado sem esperar.
  const [followupOn, setFollowupOn] = useState(true);
  // Mensagem de ausencia: quando a IA nao vai responder (fora do horario
  // ou chave desligada), o cliente recebe UMA cortesia da loja em vez de
  // silencio — no maximo 1 a cada 12h, nunca pra quem pediu PARE.
  const [awayOn, setAwayOn] = useState(true);
  const toggleAway = async () => {
    const novo = !awayOn;
    setAwayOn(novo); // otimista
    const { error } = await supa.from('whatsapp_ai_config')
      .upsert({ id:1, away_on: novo, updated_at: new Date().toISOString() }, { onConflict:'id' });
    if(error){
      setAwayOn(!novo);
      alert('Nao consegui salvar a auto-resposta: ' + error.message);
    }
  };
  const [sweep, setSweep] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const toggleFollowup = async () => {
    const novo = !followupOn;
    setFollowupOn(novo); // otimista
    const { error } = await supa.from('whatsapp_ai_config')
      .upsert({ id:1, followup_on: novo, updated_at: new Date().toISOString() }, { onConflict:'id' });
    if(error){
      setFollowupOn(!novo);
      alert('Nao consegui salvar o follow-up: ' + error.message);
    }
  };
  const rodarFollowup = async (dryRun) => {
    if(sweeping) return;
    setSweeping(true); setDiag(null);
    try {
      const { data: { session } } = await supa.auth.getSession();
      if(!session){ setDiag('Sessao expirada — entre de novo.'); setSweeping(false); return; }
      const r = await fetch('/api/whatsapp-evo/followup', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ accessToken: session.access_token, dryRun: !!dryRun })
      });
      let raw=''; try { raw = await r.text(); } catch(_){}
      let j=null; try { j = JSON.parse(raw); } catch(_){}
      setDiag(j || ('HTTP ' + r.status + ' — ' + (raw||'').slice(0,200)));
      loadIa(); load();
    } catch(e){ setDiag('Falha de rede: ' + ((e && e.message) || '?')); }
    setSweeping(false);
  };

  const toggleIa = async (waId) => {
    const novo = !iaLigada(waId);
    setIaState(s => ({ ...s, [waId]: novo })); // otimista
    const { error } = await supa.from('whatsapp_ai_state')
      .upsert({ wa_id: waId, enabled: novo, updated_at: new Date().toISOString() }, { onConflict:'wa_id' });
    if(error){
      setIaState(s => ({ ...s, [waId]: !novo }));
      alert('Nao consegui salvar a chave da IA: ' + error.message);
    }
  };

  // Copiloto: pede a sugestao da IA e joga no campo de texto (NAO envia).
  // Funciona a qualquer hora — quem pediu foi uma pessoa.
  const [sugerindo, setSugerindo] = useState(false);
  const sugerirResposta = async () => {
    if(!openWa || sugerindo) return;
    setSugerindo(true); setErr('');
    try {
      const { data: { session } } = await supa.auth.getSession();
      if(!session){ setErr('Sessao expirada — entre de novo.'); setSugerindo(false); return; }
      const r = await fetch('/api/whatsapp-evo/suggest', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ accessToken: session.access_token, waId: openWa })
      });
      let raw=''; try { raw = await r.text(); } catch(_){}
      let res={}; try { res = JSON.parse(raw); } catch(_){}
      if(!r.ok || !res.ok){
        setErr(res.error || ('IA nao respondeu (HTTP ' + r.status + ')'));
      } else {
        setText(res.reply || '');
        if(res.escalate){
          setErr('⚠️ Esta conversa pede ' + (res.reason === 'preco' ? 'PREÇO' : res.reason === 'orcamento' ? 'ORÇAMENTO' : 'atendimento humano') + ' — a sugestão acima só ganha tempo. Responda você.');
        }
      }
    } catch(_){ setErr('Falha de rede ao pedir a sugestao.'); }
    setSugerindo(false);
  };

  const resolverAlerta = async (id) => {
    setAlertas(a => a.filter(x => x.id !== id)); // otimista
    await supa.from('portal_alerts').update({ resolved:true, resolved_at:new Date().toISOString() }).eq('id', id);
  };
  const loadProfiles = async () => {
    const [profRes, leadRes] = await Promise.all([
      supa.from('profiles').select('id, name, tag, phone').not('phone','is',null).limit(3000),
      supa.from('leads').select('id, name, phone, category, status').not('phone','is',null).limit(3000),
    ]);
    const mapP = {};
    (profRes.data || []).forEach(p => {
      const dig = String(p.phone || '').replace(/\D/g, '');
      if(dig.length >= 8) mapP[dig.slice(-8)] = p;
    });
    setProfByPhone(mapP);
    const mapL = {};
    (leadRes.data || []).forEach(l => {
      const dig = String(l.phone || '').replace(/\D/g, '');
      if(dig.length >= 8) mapL[dig.slice(-8)] = l;
    });
    setLeadByPhone(mapL);
  };

  // REALTIME (Wave 45): o banco AVISA quando entra mensagem — a msg
  // aparece em ~1s, sem poll curto e sem repintar a tela inteira (so a
  // linha nova entra no array). O poll continua, mas em 60s, apenas como
  // rede de seguranca (aba que dormiu, websocket caido, tabela ainda fora
  // da publication do Supabase).
  const subRef = React.useRef(null);
  useEffect(() => {
    load(); loadProfiles(); loadIa();
    subRef.current = supa
      .channel('portal-whatsapp')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'whatsapp_messages' },
        (payload) => {
          setMsgs(prev => prev.some(m => m.id === payload.new.id) ? prev : [payload.new, ...prev]);
        })
      .subscribe();
    const t = setInterval(load, 60000);
    const tIa = setInterval(loadIa, 30000); // alertas novos da IA
    return () => {
      clearInterval(t); clearInterval(tIa);
      if(subRef.current) supa.removeChannel(subRef.current);
    };
  }, []);

  // Assina a midia da conversa aberta (so o que esta na tela).
  useEffect(() => {
    if(!openWa) return;
    const paths = msgs.filter(m => m.wa_id === openWa && m.media_url).map(m => m.media_url);
    if(paths.length) assinarMidias(paths);
  }, [openWa, msgs.length]);

  // Chegou mensagem na conversa que esta ABERTA na tela? Ja esta sendo
  // lida — nao deixa o contador subir na cara do operador.
  useEffect(() => {
    if(!openWa) return;
    const c = convs.find(x => x.waId === openWa);
    if(c && naoLidas(c) > 0) marcarLida(openWa);
  }, [openWa, msgs.length]);

  // Rola pro fim so quando FAZ SENTIDO: ao abrir a conversa, ou quando
  // chega mensagem nova E o operador ja estava olhando o fim. Se ele
  // subiu pra ler historico, a tela nao arranca dele.
  const threadRef = React.useRef(null);
  const [nMsgs, setNMsgs] = useState(0);
  useEffect(() => {
    const el = threadRef.current;
    const abriuConversa = msgs.length === nMsgs;
    setNMsgs(msgs.length);
    if(!el) return;
    const pertoDoFim = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if(abriuConversa || pertoDoFim) endRef.current?.scrollIntoView({ behavior: abriuConversa ? 'auto' : 'smooth' });
  }, [openWa, msgs.length]);

  // Agrupa por numero (mensagem mais recente primeiro).
  const convs = React.useMemo(() => {
    const map = {};
    msgs.forEach(m => {
      if(!m.wa_id) return;
      if(!map[m.wa_id]) map[m.wa_id] = { waId: m.wa_id, msgs: [], last: m, name: '' };
      map[m.wa_id].msgs.push(m);
      if(m.direction === 'in' && m.profile_name && !map[m.wa_id].name) map[m.wa_id].name = m.profile_name;
      if(new Date(m.created_at) > new Date(map[m.wa_id].last.created_at)) map[m.wa_id].last = m;
    });
    return Object.values(map).sort((a,b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  }, [msgs]);

  // NAO LIDAS: mensagens RECEBIDAS depois da ultima vez que o operador
  // abriu a conversa. A resposta da IA nao zera nada — ela nao substitui
  // alguem ler. Conversa nunca aberta conta tudo que chegou.
  const naoLidas = (c) => {
    const desde = readAt[c.waId];
    return c.msgs.filter(m => m.direction === 'in' && (!desde || new Date(m.created_at) > new Date(desde))).length;
  };

  // Marca lida ate agora. Otimista na tela; o banco guarda pra valer
  // (assim a marca vale em qualquer computador, nao so neste navegador).
  const marcarLida = async (waId) => {
    const agora = new Date().toISOString();
    setReadAt(s => ({ ...s, [waId]: agora }));
    try { window.dispatchEvent(new CustomEvent('wa-lidas-mudou')); } catch(_){}
    await supa.from('whatsapp_ai_state')
      .upsert({ wa_id: waId, last_read_at: agora }, { onConflict:'wa_id' });
  };

  const abrirConversa = (waId) => { setOpenWa(waId); setErr(''); marcarLida(waId); };

  // Prioridade: usuario do app > lead da prospeccao > nome do WhatsApp >
  // numero formatado.
  const nomeDe = (c) => {
    const chave = c.waId.slice(-8);
    const prof = profByPhone[chave];
    if(prof) return (prof.name || '@' + prof.tag) + (prof.tag ? ' (@' + prof.tag + ')' : '');
    const lead = leadByPhone[chave];
    if(lead && lead.name) return lead.name;
    return c.name || fmtWaPhone(c.waId);
  };
  // Etiqueta de origem, pra saber com quem se esta falando.
  const origemDe = (c) => {
    const chave = c.waId.slice(-8);
    if(profByPhone[chave]) return null; // usuario do app ja aparece com @tag
    const lead = leadByPhone[chave];
    return lead ? (lead.category || 'Lead') : null;
  };

  const convsFiltradas = convs.filter(c => {
    if(!busca.trim()) return true;
    const q = busca.toLowerCase();
    return c.waId.includes(q.replace(/\D/g, '') || '§') || nomeDe(c).toLowerCase().includes(q);
  });

  const aberta = convs.find(c => c.waId === openWa);
  const thread = aberta ? [...aberta.msgs].sort((a,b) => new Date(a.created_at) - new Date(b.created_at)) : [];

  const [sendStage, setSendStage] = useState('');

  // No envio so ha espera se o servidor NAO estiver aquecido (raro, com o
  // pre-aquecimento acima): caminho rapido de 2,5s e, se nem assim
  // responder, avisa "Acordando…" e da tempo do cold start terminar.
  // O edge do Cloudflare nao pode fazer isso — ele morre esperando 50s;
  // o navegador espera a vontade.
  const acordarEvolution = async () => {
    if(evoAquecido()) return;
    const ping = aquecerEvolution();
    await Promise.race([ping, new Promise(r => setTimeout(r, 2500))]);
    if(evoAquecido()) return;
    setSendStage('Acordando o servidor…');
    await Promise.race([ping, new Promise(r => setTimeout(r, 60000))]);
  };

  const enviar = async () => {
    const body = text.trim();
    if(!body || !openWa || sending) return;
    setSending(true); setErr('');
    try {
      const { data: { session } } = await supa.auth.getSession();
      if(!session){ setErr('Sessao expirada — entre de novo.'); setSending(false); return; }
      setSendStage('Enviando…');
      await acordarEvolution(); // vira "Acordando…" só se o Render estiver frio
      const r = await fetch('/api/whatsapp/send', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ accessToken: session.access_token, to: openWa, body })
      });
      // Texto primeiro: 5xx do PROPRIO Cloudflare vem como HTML — o trecho
      // cru no erro aponta a camada (mesma tatica do relatorio de exclusao).
      let raw = ''; try { raw = await r.text(); } catch(_){}
      let res = {}; try { res = JSON.parse(raw); } catch(_){}
      if(!r.ok || !res.ok){
        const snippet = res.error ? '' : (raw || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,140);
        setErr(res.error || ('Falha no envio (HTTP ' + r.status + (snippet ? ' — ' + snippet : '') + ')'));
      }
      else {
        setText('');
        // Mostra a mensagem enviada NA HORA (o realtime/poll depois traz a
        // linha real do banco; o dedupe por id evita duplicar).
        setMsgs(prev => [{
          id: 'local-' + Date.now(), direction:'out', wa_id: openWa,
          type:'text', body, created_at: new Date().toISOString(), wa_timestamp: null
        }, ...prev]);
        load();
      }
    } catch(_) { setErr('Falha de rede ao enviar.'); }
    setSending(false); setSendStage('');
  };

  // Mesma regra do servidor (normalizeWhatsAppTarget): numero brasileiro
  // local ganha o 55; numero que ja vem com DDI de outro pais passa direto.
  const novaConversa = () => {
    const v = prompt('Numero do WhatsApp\n(Brasil: DDD + numero, ex: 11 99999-9999)\n(outro pais: DDI + numero, ex: 1 650 315 4274):');
    if(v === null) return;
    const d = v.replace(/\D/g, '');
    let alvo = null;
    if(d.startsWith('55') && (d.length === 12 || d.length === 13)) alvo = d;
    else if(d.length === 10) alvo = '55' + d;
    else if(d.length === 11 && d[2] === '9') alvo = '55' + d;
    else if(d.length >= 11 && d.length <= 15) alvo = d;
    if(!alvo){ alert('Numero invalido. Brasil: DDD + numero. Outro pais: DDI + numero.'); return; }
    abrirConversa(alvo);
  };

  // Area de resultado (varredura de follow-up). O botao "Testar conexao"
  // saiu da tela em 2026-08-29: era ferramenta de depuracao do 502 do
  // envio, ja resolvido. A rota /api/whatsapp-evo/ping CONTINUA no ar —
  // se precisar diagnosticar de novo, e so chamar ela direto com o token
  // de admin.
  const [diag, setDiag] = useState(null);

  return (
    <div>
      <div style={{ marginBottom:10, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:C.muted }}>Canal: Evolution · +55 11 92072-5935</span>
        {/* Padrao global da IA: vale pra conversa que ainda nao tem chave
            propria. Serve de "desliga tudo" em caso de emergencia. */}
        <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
          {/* Chave do horario: responder fora do comercial (8h-19h BRT). */}
          <button onClick={toggleForaDeHorario}
            title={foraDeHorarioLiberado
              ? 'A IA responde a QUALQUER hora. Clique pra limitar ao horario comercial (8h-19h de Brasilia, sem domingo).'
              : 'A IA so responde das 8h as 19h de Brasilia (sem domingo). Clique pra liberar 24h.'}
            style={{ display:'flex', alignItems:'center', gap:7, background: foraDeHorarioLiberado ? C.p6+'1f' : '#fff',
              border:'1px solid '+(foraDeHorarioLiberado ? C.p6 : C.border), color: foraDeHorarioLiberado ? C.p6 : C.muted,
              borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: foraDeHorarioLiberado ? C.p6 : C.border, display:'inline-block' }} />
            {foraDeHorarioLiberado ? '🕐 Responde 24h' : '🕐 Só horário comercial'}
          </button>
          {/* Auto-resposta de ausencia (fora do horario / IA desligada). */}
          <button onClick={toggleAway}
            title={awayOn
              ? 'Auto-resposta LIGADA: fora do horario, ou com a IA desligada, o cliente recebe uma mensagem se apresentando ("aqui e da Cali Colors, obrigado pelo contato, retornamos em breve"). Uma a cada 12h por conversa, nunca pra quem pediu PARE. Clique pra desligar.'
              : 'Auto-resposta DESLIGADA: quem escrever fora do horario nao recebe nada. Clique pra ligar.'}
            style={{ display:'flex', alignItems:'center', gap:7, background: awayOn ? C.p6+'1f' : '#fff',
              border:'1px solid '+(awayOn ? C.p6 : C.border), color: awayOn ? C.p6 : C.muted,
              borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: awayOn ? C.p6 : C.border, display:'inline-block' }} />
            {awayOn ? '💬 Auto-resposta ligada' : '💬 Auto-resposta desligada'}
          </button>
          {/* Follow-up: cobra pendencia esquecida e reengaja quem sumiu. */}
          <button onClick={toggleFollowup}
            title={followupOn
              ? 'Follow-up LIGADO: de hora em hora o sistema cobra pendencia sem resposta e da um toque em quem sumiu (1 por semana, so em horario de atendimento, nunca em quem pediu PARE). Clique pra desligar.'
              : 'Follow-up DESLIGADO: ninguem e cobrado e ninguem recebe toque automatico. Clique pra ligar.'}
            style={{ display:'flex', alignItems:'center', gap:7, background: followupOn ? C.p6+'1f' : '#fff',
              border:'1px solid '+(followupOn ? C.p6 : C.border), color: followupOn ? C.p6 : C.muted,
              borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: followupOn ? C.p6 : C.border, display:'inline-block' }} />
            {followupOn ? '🔁 Follow-up ligado' : '🔁 Follow-up desligado'}
          </button>
          <Ajuda titulo="O que cada botão faz" itens={AJUDA_WHATSAPP} />
          <button onClick={()=>rodarFollowup(true)} disabled={sweeping}
            title="Simula a varredura agora e mostra o que ela FARIA, sem enviar nada."
            style={{ background:'#fff', border:'1px solid '+C.border, borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:600, cursor: sweeping?'wait':'pointer', color:C.muted }}>
            {sweeping ? '…' : '👀 Simular follow-up'}
          </button>
          <button onClick={()=>{ if(confirm('Rodar o follow-up AGORA? Mensagens podem ser enviadas aos clientes.')) rodarFollowup(false); }} disabled={sweeping}
            title="Roda a varredura de verdade agora, sem esperar a proxima hora."
            style={{ background:'#fff', border:'1px solid '+C.border, borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:600, cursor: sweeping?'wait':'pointer', color:C.muted }}>
            {sweeping ? '…' : '▶ Rodar follow-up agora'}
          </button>
          <span style={{ fontSize:11, color:C.muted }}>
            IA por padrão em conversas novas: <strong style={{ color: iaPadrao ? C.p6 : C.muted }}>{iaPadrao ? 'ligada' : 'desligada'}</strong>
          </span>
        </span>
      </div>
      {sweep && sweep.at ? (
        <div style={{ fontSize:11, color:C.muted, marginTop:-4, marginBottom:10 }}>
          Última varredura de follow-up: {new Date(sweep.at).toLocaleString('pt-BR')}
          {sweep.note ? ' — ' + sweep.note : ''}
        </div>
      ) : null}

      {/* ALERTAS — pedido de preco/orcamento e escalonamentos da IA. */}
      {alertas.length > 0 ? (
        <div style={{ background:'#fff7ed', border:'1px solid #fdba74', borderRadius:12, padding:12, marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:13, color:'#9a3412', marginBottom:8 }}>
            🔔 {alertas.length} {alertas.length === 1 ? 'pedido aguardando você' : 'pedidos aguardando você'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {alertas.slice(0, 6).map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid '+C.border, borderRadius:10, padding:'8px 12px' }}>
                <span style={{ background: a.kind==='preco' ? '#fee2e2' : a.kind==='orcamento' ? '#dbeafe' : '#f3f4f6',
                  color: a.kind==='preco' ? '#b91c1c' : a.kind==='orcamento' ? '#1d4ed8' : '#374151',
                  borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>{a.kind}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:C.ink }}>{a.title}</div>
                  {a.body ? <div style={{ fontSize:11, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>“{a.body}”</div> : null}
                </div>
                <button onClick={()=>abrirConversa(a.wa_id)}
                  style={{ background:C.p1, color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                  Abrir conversa
                </button>
                <button onClick={()=>resolverAlerta(a.id)} title="Marcar como resolvido"
                  style={{ background:'none', border:'1px solid '+C.border, borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', color:C.muted }}>✓</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {diag ? (
        <pre style={{ background:'#1a1a2e', color:'#e6e6f0', padding:12, borderRadius:10, fontSize:11, lineHeight:1.5, overflowX:'auto', marginBottom:12, maxHeight:260 }}>
          {typeof diag === 'string' ? diag : JSON.stringify(diag, null, 2)}
        </pre>
      ) : null}
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(26,26,46,.06)', overflow:'hidden', display:'flex', height:'calc(100vh - 230px)', minHeight:420 }}>
        {/* Coluna de conversas */}
        <div style={{ width:320, minWidth:260, borderRight:'1px solid '+C.border, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:12, borderBottom:'1px solid '+C.border, display:'flex', gap:8 }}>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar numero ou nome…"
              style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1.5px solid '+C.border, fontSize:13, outline:'none' }} />
            <button onClick={novaConversa} title="Nova conversa"
              style={{ background:C.p1, color:'#fff', border:'none', borderRadius:10, padding:'0 14px', fontWeight:700, fontSize:18, cursor:'pointer' }}>+</button>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:20, color:C.muted, fontSize:13 }}>Carregando…</div>
            ) : convsFiltradas.length === 0 ? (
              <div style={{ padding:20, color:C.muted, fontSize:13 }}>
                {convs.length === 0
                  ? 'Nenhuma conversa ainda. Mensagens recebidas no +55 11 92072-5935 aparecem aqui.'
                  : 'Nada encontrado na busca.'}
              </div>
            ) : convsFiltradas.map(c => (
              <div key={c.waId} onClick={() => abrirConversa(c.waId)}
                style={{ padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid '+C.cream,
                  background: openWa === c.waId ? C.cream : 'transparent' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}>
                  <strong style={{ fontSize:13, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    fontWeight: naoLidas(c) > 0 ? 800 : 600 }}>{nomeDe(c)}</strong>
                  <span style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    {naoLidas(c) > 0 ? (
                      <span title={naoLidas(c) + ' mensagem(ns) que voce ainda nao abriu'}
                        style={{ background:C.p1, color:'#fff', borderRadius:10, fontSize:10, fontWeight:800,
                          padding:'1px 7px', lineHeight:'16px' }}>{naoLidas(c) > 99 ? '99+' : naoLidas(c)}</span>
                    ) : null}
                    <span style={{ fontSize:11, color:C.muted, whiteSpace:'nowrap' }}>{waHora(c.last)}</span>
                  </span>
                </div>
                {origemDe(c) ? (
                  <div style={{ fontSize:10, color:C.p3, fontWeight:600, marginTop:1 }}>{origemDe(c)}</div>
                ) : null}
                <div style={{ fontSize:12, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                  {(c.last.direction === 'out' ? 'Voce: ' : '') + previewMsg(c.last)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Thread */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:C.cream }}>
          {!openWa ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:14, padding:20, textAlign:'center' }}>
              Selecione uma conversa ao lado — ou toque em + pra comecar uma nova.<br/>Canal: +55 11 92072-5935 (Evolution).
            </div>
          ) : (
            <>
              <div style={{ padding:'12px 16px', background:'#fff', borderBottom:'1px solid '+C.border, fontWeight:700, fontSize:14, color:C.ink }}>
                {aberta ? nomeDe(aberta) : (leadByPhone[openWa.slice(-8)]?.name || fmtWaPhone(openWa))}
                <span style={{ fontWeight:400, color:C.muted, fontSize:12, marginLeft:8 }}>{fmtWaPhone(openWa)}</span>
                {(() => {
                  const org = aberta ? origemDe(aberta) : (leadByPhone[openWa.slice(-8)]?.category || null);
                  return org ? <span style={{ marginLeft:8, background:C.p3+'1f', color:C.p3, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{org}</span> : null;
                })()}
                {/* CHAVE DA IA — liga/desliga a resposta automatica NESTA
                    conversa. Desliga sozinha quando escala pra humano. */}
                <button onClick={()=>toggleIa(openWa)} title={iaLigada(openWa) ? 'IA respondendo — clique pra assumir a conversa' : 'IA desligada — clique pra ela responder'}
                  style={{ float:'right', display:'flex', alignItems:'center', gap:6, background: iaLigada(openWa) ? C.p6+'1f' : 'transparent',
                    border:'1px solid '+(iaLigada(openWa) ? C.p6 : C.border), color: iaLigada(openWa) ? C.p6 : C.muted,
                    borderRadius:20, padding:'4px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: iaLigada(openWa) ? C.p6 : C.border, display:'inline-block' }} />
                  {iaLigada(openWa) ? 'IA ligada' : 'IA desligada'}
                </button>
                {/* Ultima decisao da IA nesta conversa — explica o silencio
                    (horario, teto diario, chave, erro) em vez de deixar o
                    operador adivinhando. */}
                {iaWhy[openWa] ? (
                  <div style={{ clear:'both', textAlign:'right', fontSize:10, color:C.muted, fontWeight:400, marginTop:2 }}>
                    IA: {iaWhy[openWa].why}
                    {iaWhy[openWa].at ? ' · ' + new Date(iaWhy[openWa].at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : ''}
                  </div>
                ) : null}
              </div>
              <div ref={threadRef} style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:6 }}>
                {thread.length === 0 ? (
                  <div style={{ color:C.muted, fontSize:13, textAlign:'center', marginTop:20 }}>Sem historico com este numero — escreva a primeira mensagem abaixo.</div>
                ) : thread.map(m => (
                  <div key={m.id} style={{
                    alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start',
                    maxWidth:'72%', padding:'8px 12px', borderRadius:12, fontSize:13, lineHeight:1.45,
                    background: m.direction === 'out' ? C.p1 : '#fff',
                    color: m.direction === 'out' ? '#fff' : C.ink,
                    boxShadow:'0 1px 3px rgba(0,0,0,.06)', whiteSpace:'pre-wrap', wordBreak:'break-word'
                  }}>
                    <BolhaConteudo m={m} url={m.media_url ? midiaUrls[m.media_url] : null} />
                    <div style={{ fontSize:10, opacity:.7, marginTop:3, textAlign:'right' }}>{waHora(m)}</div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {err ? <div style={{ padding:'8px 16px', background:'#fdecea', color:'#b3261e', fontSize:12 }}>{err}</div> : null}
              <div style={{ display:'flex', gap:8, padding:12, background:'#fff', borderTop:'1px solid '+C.border }}>
                <input value={text} onChange={e=>{ setText(e.target.value); if(!evoAquecido()) aquecerEvolution(); }}
                  onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); enviar(); } }}
                  placeholder="Escreva uma mensagem…"
                  style={{ flex:1, padding:'10px 14px', borderRadius:12, border:'1.5px solid '+C.border, fontSize:14, outline:'none' }} />
                {/* COPILOTO: traz a sugestao da IA pro campo, sem enviar.
                    Funciona a qualquer hora (quem pediu foi uma pessoa). */}
                <button onClick={sugerirResposta} disabled={sugerindo} title="A IA lê a conversa e escreve a resposta aqui (você revisa antes de enviar)"
                  style={{ background:'#fff', color:C.p3, border:'1.5px solid '+C.border, borderRadius:12, padding:'0 14px', fontWeight:700, fontSize:13,
                    cursor: sugerindo ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>
                  {sugerindo ? '✨ Pensando…' : '✨ Sugerir'}
                </button>
                <button onClick={enviar} disabled={sending || !text.trim()}
                  style={{ background:C.p1, color:'#fff', border:'none', borderRadius:12, padding:'0 20px', fontWeight:700, fontSize:14,
                    cursor: sending ? 'wait' : 'pointer', opacity: sending || !text.trim() ? .6 : 1 }}>
                  {sending ? (sendStage || 'Enviando…') : 'Enviar'}
                </button>
              </div>
              {sending && sendStage === 'Acordando o servidor…' ? <div style={{ padding:'4px 16px 10px', background:'#fff', color:C.muted, fontSize:11 }}>O servidor do WhatsApp dorme apos 15min parado (plano free) — acordando ele antes de enviar, pode levar ate 1 minuto.</div> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const PAGES_DEF = [
  { id:'dashboard', icon:'📊', label:'Dashboard', section:'PRINCIPAL', component:<Dashboard /> },
  { id:'avisos', icon:'📢', label:'Avisos / Notificacoes', section:'PRINCIPAL', component:<Avisos /> },
  { id:'chats', icon:'💬', label:'Chats 3-Way', section:'PRINCIPAL', badgeKey:'chats', component:<Chats /> },
  { id:'whatsapp', icon:'📱', label:'WhatsApp', section:'PRINCIPAL', badgeKey:'whatsapp', component:<WhatsAppTab /> },
  { id:'orcamentos', icon:'📋', label:'Orçamentos', section:'PRINCIPAL', badgeKey:'orcamentos', component:<Orcamentos /> },
  { id:'pintores', icon:'🖌️', label:'Pintores', section:'PESSOAS', badgeKey:'pintores', component:<PintoresList key="pintores" roleFilter={p=>currentRoleKey(p)==='pintor'} title="Pintores Cadastrados" defaultRole="pintor" emptyMsg="Nenhum pintor cadastrado." /> },
  { id:'grafiteiros', icon:'🎨', label:'Grafiteiros', section:'PESSOAS', badgeKey:'grafiteiros', component:<PintoresList key="grafiteiros" roleFilter={p=>currentRoleKey(p)==='grafiteiro'} title="Grafiteiros / Muralistas" defaultRole="grafiteiro" emptyMsg="Nenhum grafiteiro cadastrado." /> },
  { id:'funileiros', icon:'🚗', label:'Funileiros / Automotivo', section:'PESSOAS', badgeKey:'funileiros', component:<PintoresList key="funileiros" roleFilter={p=>currentRoleKey(p)==='funileiro'||currentRoleKey(p)==='automotivo'} title="Funileiros / Pintura Automotiva" defaultRole="funileiro" emptyMsg="Nenhum funileiro cadastrado." /> },
  { id:'leads', icon:'🧲', label:'Leads', section:'PESSOAS', badgeKey:'leads', component:<Leads /> },
  { id:'clientes', icon:'👥', label:'Clientes', section:'PESSOAS', badgeKey:'clientes', component:<ClientesList /> },
  { id:'portal-users', icon:'🔐', label:'Portal', section:'PESSOAS', badgeKey:'portalUsers', component:<PortalUsersList /> },
  { id:'pedidos-loja', icon:'🛒', label:'Pedidos da Loja', section:'LOJA', component:<PedidosLoja /> },
  { id:'produtos', icon:'🎨', label:'Produtos / Tintas', section:'LOJA', component:<ProdutosList /> },
  { id:'camisetas', icon:'👕', label:'Camisetas Personalizadas', section:'LOJA', component:<Camisetas /> },
  { id:'cursos', icon:'📚', label:'Cursos', section:'LOJA', component:<CursosList /> },
  { id:'marketing', icon:'📣', label:'Marketing / Ads', section:'LOJA', component:<MarketingPage /> },
  { id:'moderacao', icon:'🛡️', label:'Moderação', section:'PRINCIPAL', component:<Moderacao /> },
  { id:'analytics', icon:'📈', label:'Analytics', section:'DADOS', component:<Analytics /> },
  { id:'indicacoes', icon:'🔗', label:'Indicações', section:'DADOS', component:<Indicacoes /> },
  { id:'avaliacoes', icon:'⭐', label:'Avaliações', section:'DADOS', component:<AvaliacoesTab /> },
];

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Portal crash:', error && error.message); }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style:{padding:24,color:'#c00',fontFamily:'monospace',whiteSpace:'pre-wrap'} },
        'Erro no portal: ' + (this.state.error.message || 'desconhecido') + '\nRecarregue a página.');
    }
    return this.props.children;
  }
}

// ============================================================
// Telas de autenticacao (login / signup com convite / reset de senha).
// Extraidas do App para deixar o componente raiz menor. Cada tela recebe
// estado/handlers via props — fonte de verdade segue no App.
// ============================================================
const AuthCard = ({ children }) => (
  <div style={{ minHeight:'100vh', background:C.ink, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ background:C.white, borderRadius:24, padding:40, width:360, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
      <div style={{ fontFamily:'Syne,sans-serif', fontSize:24, fontWeight:800, marginBottom:4 }}>
        <span style={{ color:C.ink }}>Cali</span><span style={{ color:C.p1 }}>Colors</span>
      </div>
      <div style={{ fontSize:13, color:C.muted, marginBottom:28 }}>Portal de Gestão QueroUmaCor</div>
      {children}
    </div>
  </div>
);

function LoginScreen({ email, setEmail, pw, setPw, loginError, loginLoading, onLogin, onSwitchSignup, onSwitchReset }) {
  return (
    <AuthCard>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Email</div>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="loja@calicolors.com.br" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
      </div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Senha</div>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
      </div>
      <div style={{ textAlign:'right', marginBottom:16 }}>
        <span onClick={onSwitchReset} style={{ fontSize:12, color:C.p1, cursor:'pointer', fontWeight:600 }}>Esqueci minha senha</span>
      </div>
      {loginError && <div style={{color:'#e63946',fontSize:13,marginBottom:12,textAlign:'center'}}>{loginError}</div>}
      <button disabled={loginLoading} onClick={onLogin} style={{ width:'100%', padding:'12px', background:C.p1, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer' }}>
        Entrar no Portal
      </button>
      <div style={{ textAlign:'center', marginTop:14 }}>
        <span onClick={onSwitchSignup} style={{ fontSize:13, color:C.p1, cursor:'pointer', fontWeight:600 }}>Criar conta no portal</span>
      </div>
      <div style={{ textAlign:'center', marginTop:6, fontSize:12, color:C.muted }}>Acesso exclusivo Cali Colors</div>
    </AuthCard>
  );
}

function SignupScreen({ step, signupCode, setSignupCode, signupName, setSignupName, email, setEmail, pw, setPw, validatedInvite, loginError, loginLoading, onValidateInvite, onCreateAccount, onBack }) {
  return (
    <AuthCard>
      {step === 0 ? (<>
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:6 }}>Codigo de Convite</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Para criar uma conta no portal, voce precisa de um codigo de convite de alguem que ja tem acesso.</div>
        <div style={{ marginBottom:14 }}>
          <input value={signupCode} onChange={e=>setSignupCode(e.target.value.toUpperCase())} placeholder="QUC-XXXXX" style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:18, fontWeight:700, letterSpacing:2, textAlign:'center', outline:'none', fontFamily:'monospace' }} />
        </div>
        {loginError && <div style={{color:'#e63946',fontSize:13,marginBottom:12,textAlign:'center'}}>{loginError}</div>}
        <button disabled={loginLoading} onClick={onValidateInvite} style={{ width:'100%', padding:'12px', background:C.p1, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer' }}>
          {loginLoading ? 'Validando...' : 'Validar Codigo'}
        </button>
      </>) : (<>
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:4 }}>Criar conta</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Codigo <b>{validatedInvite?.code}</b> validado</div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Nome</div>
          <input value={signupName} onChange={e=>setSignupName(e.target.value)} placeholder="Seu nome" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Email</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@exemplo.com" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Senha</div>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Minimo 6 caracteres" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
        </div>
        {loginError && <div style={{color:'#e63946',fontSize:13,marginBottom:12,textAlign:'center'}}>{loginError}</div>}
        <button disabled={loginLoading} onClick={onCreateAccount} style={{ width:'100%', padding:'12px', background:C.p1, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer' }}>
          {loginLoading ? 'Criando conta...' : 'Criar Conta'}
        </button>
      </>)}
      <div style={{ textAlign:'center', marginTop:14 }}>
        <span onClick={onBack} style={{ fontSize:13, color:C.p1, cursor:'pointer', fontWeight:600 }}>← Voltar ao login</span>
      </div>
    </AuthCard>
  );
}

function ResetPasswordScreen({ email, setEmail, loginError, loginLoading, resetMsg, onReset, onBack }) {
  return (
    <AuthCard>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Email</div>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="loja@calicolors.com.br" style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid '+C.border, fontSize:14, outline:'none' }} />
      </div>
      {resetMsg && <div style={{color:'#2e7d32',fontSize:13,marginBottom:12,textAlign:'center'}}>{resetMsg}</div>}
      {loginError && <div style={{color:'#e63946',fontSize:13,marginBottom:12,textAlign:'center'}}>{loginError}</div>}
      <button disabled={loginLoading} onClick={onReset} style={{ width:'100%', padding:'12px', background:C.p1, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer' }}>
        {loginLoading ? 'Enviando...' : 'Enviar link de redefinição'}
      </button>
      <div style={{ textAlign:'center', marginTop:14 }}>
        <span onClick={onBack} style={{ fontSize:13, color:C.p1, cursor:'pointer', fontWeight:600 }}>← Voltar ao login</span>
      </div>
    </AuthCard>
  );
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  // mode: 'login' | 'signup' | 'reset' — substitui resetMode+signupMode.
  const [mode, setMode] = useState('login');
  const [resetMsg, setResetMsg] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [signupStep, setSignupStep] = useState(0);
  const [validatedInvite, setValidatedInvite] = useState(null);
  const [badges, setBadges] = useState({});

  const loadBadges = async () => {
    try {
      const sb = supa;
      if(!sb) return;
      const [quotesRes, profiles, leadsRes] = await Promise.all([
        sb.from('quotes').select('id', { count: 'exact', head: true }),
        profilesService.list({ fields: 'role, user_type, profession, portal_access' }),
        sb.from('leads').select('id', { count: 'exact', head: true }),
      ]);
      // Mescla em vez de substituir: o badge do WhatsApp e carregado
      // por outro caminho (loadWaBadge) e nao pode ser apagado aqui.
      setBadges(b => ({
        ...b,
        // `chats` NAO entra aqui: virou nao-lidas, calculado em
        // loadNaoLidos junto com o do WhatsApp.
        orcamentos: quotesRes.count || 0,
        pintores: profiles.filter(p => isProProfile(p) && currentRoleKey(p)==='pintor').length,
        grafiteiros: profiles.filter(p => isProProfile(p) && currentRoleKey(p)==='grafiteiro').length,
        funileiros: profiles.filter(p => isProProfile(p) && (currentRoleKey(p)==='funileiro'||currentRoleKey(p)==='automotivo')).length,
        leads: leadsRes.count || 0,
        clientes: profiles.filter(isClienteProfile).length,
        portalUsers: profiles.filter(p => p.portal_access === true).length,
      }));
    } catch(e) { console.error('loadBadges error:', e); }
  };

  // WhatsApp nao lido: mensagens RECEBIDAS depois da ultima vez que o
  // operador abriu aquela conversa (whatsapp_ai_state.last_read_at). Fica
  // separado do loadBadges porque precisa ser leve e frequente — o resto
  // dos badges e caro e quase estatico.
  const loadWaBadge = async () => {
    try {
      const desde = new Date(Date.now() - 30*24*3600*1000).toISOString();
      const { data: { session } } = await supa.auth.getSession();
      const meuId = session && session.user ? session.user.id : null;
      const [msgsRes, stRes, chatRes, chatReadRes] = await Promise.all([
        supa.from('whatsapp_messages').select('wa_id, created_at')
          .eq('direction','in').gte('created_at', desde).limit(3000),
        supa.from('whatsapp_ai_state').select('wa_id, last_read_at').limit(3000),
        supa.from('messages').select('conversation_id, sender_id, created_at')
          .gte('created_at', desde).limit(3000),
        supa.from('portal_chat_reads').select('conversation_id, last_read_at').limit(2000),
      ]);
      const lido = {};
      (stRes.data || []).forEach(r => { if(r.last_read_at) lido[r.wa_id] = r.last_read_at; });
      const n = (msgsRes.data || []).filter(m =>
        !lido[m.wa_id] || new Date(m.created_at) > new Date(lido[m.wa_id])).length;

      // Chats 3-Way: mesma conta. Antes o badge era o TOTAL de mensagens
      // da tabela — nao dizia nada e nunca baixava.
      const lidoChat = {};
      (chatReadRes.data || []).forEach(r => { lidoChat[r.conversation_id] = r.last_read_at; });
      const nChat = (chatRes.data || []).filter(m => {
        if(meuId && m.sender_id === meuId) return false;
        const marca = lidoChat[m.conversation_id];
        return !marca || new Date(m.created_at) > new Date(marca);
      }).length;

      setBadges(b => (b.whatsapp === n && b.chats === nChat ? b : { ...b, whatsapp: n, chats: nChat }));
    } catch(e) { /* badge e enfeite: nunca derruba o portal */ }
  };

  useEffect(() => {
    if(!loggedIn) return;
    loadBadges(); loadWaBadge();
    // Realtime avisa na hora que chegou mensagem; o intervalo e rede de
    // seguranca; o evento vem da propria aba quando alguem le a conversa.
    const canal = supa.channel('portal-wa-badge')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'whatsapp_messages' }, loadWaBadge)
      .subscribe();
    const t = setInterval(loadWaBadge, 45000);
    window.addEventListener('wa-lidas-mudou', loadWaBadge);
    return () => {
      clearInterval(t);
      window.removeEventListener('wa-lidas-mudou', loadWaBadge);
      supa.removeChannel(canal);
    };
  }, [loggedIn]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supa.auth.getSession();
        if (session && session.user) {
          const { data: prof } = await supa.from('profiles').select('portal_access').eq('id', session.user.id).single();
          if (prof && prof.portal_access) setLoggedIn(true);
        }
      } catch(e) { /* sessão inválida: mostra login */ }
      finally { setAuthChecking(false); }
    })();
  }, []);

  const PAGES = React.useMemo(
    () => PAGES_DEF.map(p => ({ ...p, badge: p.badgeKey ? (badges[p.badgeKey] || null) : undefined })),
    [badges]
  );
  // Estes hooks PRECISAM rodar antes dos early returns abaixo, senao a
  // ordem dos hooks muda entre renders (Rules of Hooks).
  const currentPage = React.useMemo(() => PAGES.find(p => p.id === page), [PAGES, page]);
  const sections = React.useMemo(() => [...new Set(PAGES.map(p => p.section))], [PAGES]);
  const handleNav = React.useCallback((id) => setPage(id), []);

  if (authChecking) return (
    <div style={{ minHeight:'100vh', background:C.ink, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:700 }}>
      Carregando portal...
    </div>
  );

  if (!loggedIn) {
    const handleLogin = async () => {
      setLoginError(''); setLoginLoading(true);
      try {
        const { data, error } = await supa.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        const { data: prof } = await supa.from('profiles').select('portal_access').eq('id', data.user.id).single();
        if (!prof || !prof.portal_access) {
          await supa.auth.signOut();
          throw new Error('Sem permissao. Esta conta nao tem acesso ao portal.');
        }
        setLoggedIn(true);
      } catch (e) {
        setLoginError(e.message || 'Email ou senha incorretos');
      } finally { setLoginLoading(false); }
    };
    const handleSwitchSignup = () => {
      setMode('signup'); setSignupStep(0); setLoginError('');
      setSignupCode(''); setSignupName(''); setEmail(''); setPw(''); setValidatedInvite(null);
    };
    const handleSwitchReset = () => { setMode('reset'); setLoginError(''); setResetMsg(''); };
    const handleBackToLogin = () => { setMode('login'); setLoginError(''); setResetMsg(''); };
    const handleValidateInvite = async () => {
      setLoginError(''); setLoginLoading(true);
      try {
        if (!signupCode.trim()) throw new Error('Insira o codigo de convite');
        const { data: inv, error } = await supa.from('invites').select('id, code, used, max_uses, uses, created_by').eq('code', signupCode.trim()).single();
        if (error || !inv) throw new Error('Codigo invalido');
        if (inv.used || (inv.max_uses > 0 && inv.uses >= inv.max_uses)) throw new Error('Este codigo ja foi utilizado');
        const { data: inviter } = await supa.from('profiles').select('portal_access').eq('id', inv.created_by).single();
        if (!inviter || !inviter.portal_access) throw new Error('Este codigo nao da acesso ao portal. O codigo precisa ser de alguem que ja tem acesso ao portal.');
        setValidatedInvite(inv); setSignupStep(1);
      } catch (e) { setLoginError(e.message); }
      finally { setLoginLoading(false); }
    };
    const handleCreateAccount = async () => {
      setLoginError(''); setLoginLoading(true);
      try {
        if (!signupName.trim() || !email.trim() || !pw) throw new Error('Preencha todos os campos');
        if (pw.length < 8) throw new Error('Senha deve ter no minimo 8 caracteres');
        const res = await authService.signUpAppUser({
          name: signupName.trim(),
          email: email.trim(),
          password: pw,
          role: 'admin',
          portalAccess: true,
          inviteCode: validatedInvite.code,
          userMetadata: { role: 'admin' },
          extraProfile: { invited_by: validatedInvite.created_by }
        });
        if (!res.ok) throw new Error(res.error || 'Erro ao criar conta');
        await supa.from('invites').update({ uses: (validatedInvite.uses || 0) + 1 }).eq('id', validatedInvite.id);
        const { error: signInErr } = await supa.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (signInErr) throw signInErr;
        setLoggedIn(true);
      } catch (e) {
        setLoginError(e.message || 'Erro ao criar conta');
      } finally { setLoginLoading(false); }
    };
    const handleReset = async () => {
      setLoginError(''); setResetMsg(''); setLoginLoading(true);
      try {
        if (!email) throw new Error('Informe seu email');
        const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
        if (error) throw error;
        setResetMsg('Link de redefinição enviado para ' + email);
      } catch (e) { setLoginError(e.message || 'Erro ao enviar email'); }
      finally { setLoginLoading(false); }
    };

    if (mode === 'reset') return (
      <ResetPasswordScreen
        email={email} setEmail={setEmail}
        loginError={loginError} loginLoading={loginLoading} resetMsg={resetMsg}
        onReset={handleReset} onBack={handleBackToLogin}
      />
    );
    if (mode === 'signup') return (
      <SignupScreen
        step={signupStep}
        signupCode={signupCode} setSignupCode={setSignupCode}
        signupName={signupName} setSignupName={setSignupName}
        email={email} setEmail={setEmail}
        pw={pw} setPw={setPw}
        validatedInvite={validatedInvite}
        loginError={loginError} loginLoading={loginLoading}
        onValidateInvite={handleValidateInvite}
        onCreateAccount={handleCreateAccount}
        onBack={handleBackToLogin}
      />
    );
    return (
      <LoginScreen
        email={email} setEmail={setEmail} pw={pw} setPw={setPw}
        loginError={loginError} loginLoading={loginLoading}
        onLogin={handleLogin}
        onSwitchSignup={handleSwitchSignup}
        onSwitchReset={handleSwitchReset}
      />
    );
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif' }}>
      {/* SIDEBAR */}
      <nav aria-label="Menu administrativo" style={{ width:240, background:C.ink, position:'fixed', top:0, left:0, height:'100vh', overflow:'hidden', zIndex:100, display:'flex', flexDirection:'column' }}>
        <Logo />
        <div style={{ padding:'8px 0', marginTop:8, flex:1, overflowY:'auto' }}>
          {sections.map(section => (
            <div key={section}>
              <div style={{ fontSize:10, color:C.muted, letterSpacing:2, textTransform:'uppercase', padding:'12px 20px 4px' }}>{section}</div>
              {PAGES.filter(p => p.section === section).map(p => (
                <NavItem key={p.id} icon={p.icon} label={p.label} badge={p.badge} active={page===p.id} onClick={()=>handleNav(p.id)} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ flexShrink:0, padding:16, borderTop:'1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, color:'rgba(255,255,255,0.7)', fontSize:13 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:C.p1, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff' }}>C</div>
            <div>
              <div style={{ fontWeight:600, color:C.white }}>Cali Colors</div>
              <div style={{ fontSize:11 }}>Plano Business · Ativo</div>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div style={{ marginLeft:240, flex:1, display:'flex', flexDirection:'column' }}>
        {/* TOPBAR */}
        <header role="banner" style={{ background:C.white, borderBottom:'1px solid '+C.border, padding:'0 28px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
          <div>
            <div style={{ fontFamily:'Syne, sans-serif', fontSize:18, fontWeight:800, color:C.ink }}>{currentPage?.label}</div>
            <div style={{ fontSize:12, color:C.muted }}>{new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={()=>{ if(window.confirm('Tem certeza que deseja sair do portal?')) { supa.auth.signOut(); setLoggedIn(false); } }} style={{ background:'transparent', border:'1px solid '+C.border, borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, color:C.muted }}>Sair</button>
          </div>
        </header>

        {/* CONTENT */}
        <main style={{ padding:28, flex:1 }}>
          {currentPage?.component}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);