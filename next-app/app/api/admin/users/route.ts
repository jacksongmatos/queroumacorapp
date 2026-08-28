// app/api/admin/users/route.ts — port de `functions/api/admin-users.js`.
// Promove/revoga portal_access, set PRO, role, verified. Adiciona modo
// read-only (`query`/`email`/`userId` sem `action`) pra preencher UI de busca.

import { type NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getServiceKey,
  getToken,
  isAdminEmail,
  jsonResponse,
  rateLimitResponse,
  readBody,
  ServiceError,
  serviceErrorResponse,
} from '@/lib/api/security';
import { verifyAdminToken } from '@/lib/api/_services/_admin-helpers';
import {
  buildPatch,
  deleteUserPermanently,
  ensureCallerHasPortalAccess,
  listUsers,
  patchProfile,
  setTag,
} from '@/lib/api/_services/admin-users';
import { logAuditEvent } from '@/lib/api/audit';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  if (!getServiceKey()) {
    return jsonResponse(
      {
        error:
          'Gestão de usuários não configurada (SUPABASE_SERVICE_ROLE/SUPABASE_SERVICE_KEY ausente)',
      },
      503
    );
  }
  let body: {
    action?: unknown;
    userId?: unknown;
    accessToken?: unknown;
    query?: unknown;
    email?: unknown;
    value?: unknown;
    expiresAt?: unknown;
    roleKey?: unknown;
    tag?: unknown;
  };
  try {
    body = (await readBody(request, { maxBytes: 1024 * 1024 })) as typeof body;
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  try {
    const token = getToken(request, body);
    const { callerId, email } = await verifyAdminToken(token);
    if (!callerId) throw new ServiceError('token inválido', 401);
    // Diagnóstico no texto: sem saber QUAL email o servidor viu, o
    // operador não tem como consertar a allowlist — a mensagem antiga
    // ("email não admin") mandava adivinhar. O email é o do próprio
    // caller autenticado, então dizer não vaza nada que ele já não saiba.
    if (!isAdminEmail(email)) {
      throw new ServiceError(
        `não autorizado: o email "${email || '(sem email no login)'}" não está na lista ADMIN_EMAILS do servidor. ` +
          'Adicione esse email na env ADMIN_EMAILS (Cloudflare Pages → Settings → Environment variables → Production) e refaça o deploy.',
        403,
      );
    }
    const rl = await checkRateLimit({
      userId: callerId || email,
      endpoint: 'admin-users',
      limit: 30,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    // Modo read-only: nenhuma action → busca por query/email/userId.
    if (!action) {
      return jsonResponse(
        await listUsers({
          query: typeof body?.query === 'string' ? body.query : undefined,
          email: typeof body?.email === 'string' ? body.email : undefined,
          userId: userId || undefined,
        })
      );
    }

    if (!userId) return jsonResponse({ error: 'userId obrigatório' }, 400);
    await ensureCallerHasPortalAccess({ callerId });

    let result: Record<string, unknown>;
    let auditChanges: Record<string, unknown>;
    if (action === 'delete_user') {
      // Exclusão PERMANENTE (Auth + profiles). Guardas no service: nunca a
      // própria conta, nunca admin/portal sem revogar antes.
      result = await deleteUserPermanently({ userId, callerId });
      auditChanges = { deleted: true, admin_email: email };
    } else if (action === 'set_tag') {
      // Regra do app: @tag nunca vazia (busca/link dependem dela).
      result = await setTag({ userId, tag: body?.tag });
      auditChanges = { tag: result.tag, admin_email: email };
    } else {
      const patch = buildPatch({
        action,
        value: body?.value,
        expiresAt: body?.expiresAt,
        roleKey: body?.roleKey,
      });
      result = await patchProfile({ userId, patch });
      auditChanges = { patch, admin_email: email };
    }
    // Audit-log: ação admin em profile alvo. `changes` carrega o patch
    // (sem segredos — buildPatch só constrói campos de RBAC/PRO/role).
    // R-H5: critical=true pra mudanças sensíveis (set_pro / promote/revoke /
    // delete_user) — sem trilha, sumimos com prova de quem promoveu/apagou
    // quem (input de auditoria interna + DPO). Outras actions mantêm
    // fail-open.
    const isCriticalAction =
      action === 'set_pro' ||
      action === 'promote' ||
      action === 'revoke' ||
      action === 'delete_user';
    try {
      await logAuditEvent({
        actorId: callerId || null,
        action: `admin.user.${action}`,
        targetTable: 'profiles',
        targetId: userId,
        changes: auditChanges,
        request,
        critical: isCriticalAction,
      });
    } catch (e) {
      // Throw aqui = audit critical falhou. Profile JÁ foi modificado;
      // melhor logar e retornar 500 genérico do que vazar inconsistência
      // pra UI admin (que mostraria sucesso sem trilha).
      console.error(
        'admin-users: CRITICAL audit insert failed',
        { action, targetUserId: userId },
        e instanceof Error ? e.message : e,
      );
      return NextResponse.json({ error: 'erro interno' }, { status: 500 });
    }
    return jsonResponse(result);
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    console.warn('admin-users crash:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
