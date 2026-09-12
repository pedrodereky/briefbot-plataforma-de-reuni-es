/**
 * Autorização compartilhada pelas edge functions.
 *
 * O problema que este módulo resolve (auditoria P0 item 2): as funções operam
 * com a service key, que ignora RLS. Quem recebia `meeting_id` no corpo e agia
 * direto estava deixando qualquer um encerrar reunião alheia, iniciar gravação
 * na conta LiveKit de terceiro ou disparar e-mail pelo domínio de outro
 * usuário.
 *
 * Três tipos de chamador são legítimos e precisam ser distinguidos:
 *
 *   service — outra edge function ou o cron, com a service key. A cadeia
 *             interna depende disso (cron -> generate-briefing,
 *             end-meeting -> generate-summary, livekit-webhook -> ...).
 *   user    — pessoa logada; só pode agir sobre reunião própria.
 *   guest   — convidado sem conta, provando posse do join_token da reunião.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse, requestId } from "./http.ts";
import { timingSafeEqual } from "./sanitize.ts";

export { sanitizeGuestName, timingSafeEqual } from "./sanitize.ts";

export type Caller =
  | { kind: "service" }
  | { kind: "user"; userId: string }
  | { kind: "guest"; meetingId: string };

export interface MeetingOwnership {
  meetingId: string;
  ownerId: string;
  caller: Caller;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Chamada server-to-server.
 *
 * Compara o bearer com a service key em vez de decodificar JWT porque o
 * projeto usa o formato novo de chave (`sb_secret_`), que é opaco.
 */
export function isServiceRole(req: Request): boolean {
  const token = bearerToken(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !serviceKey) return false;
  return timingSafeEqual(token, serviceKey);
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

/** Valida o JWT e devolve o usuário, ou null se não houver JWT válido. */
export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  // A service key não é JWT de usuário — não tente validá-la como tal.
  if (isServiceRole(req)) return null;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    const claims = data.claims as { sub: string; email?: string };
    return { id: claims.sub, email: claims.email ?? null };
  } catch {
    return null;
  }
}

/** Devolve o id do usuário logado, ou null se não houver JWT válido. */
export async function getUserId(req: Request): Promise<string | null> {
  const user = await getAuthenticatedUser(req);
  return user?.id ?? null;
}

/** Exige usuário autenticado, sem vínculo com reunião específica. */
export async function requireUser(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const userId = await getUserId(req);
  if (!userId) {
    return { ok: false, response: errorResponse(req, "Unauthorized", 401) };
  }
  return { ok: true, userId };
}

/**
 * Porta de entrada das funções que agem sobre uma reunião.
 *
 * Aceita service key (cadeia interna) ou o DONO da reunião. Qualquer outro
 * usuário autenticado recebe 403 — é exatamente o IDOR que estava aberto.
 *
 * Reunião inexistente devolve 404; reunião de outro dono devolve 403 apenas
 * depois de confirmar que o chamador está autenticado.
 */
export async function requireMeetingOwner(
  req: Request,
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ ok: true; value: MeetingOwnership } | { ok: false; response: Response }> {
  if (!meetingId) {
    return { ok: false, response: errorResponse(req, "meeting_id is required", 400) };
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("id", meetingId)
    .maybeSingle();

  if (error || !meeting) {
    return { ok: false, response: errorResponse(req, "Meeting not found", 404) };
  }

  if (isServiceRole(req)) {
    return {
      ok: true,
      value: { meetingId: meeting.id, ownerId: meeting.user_id, caller: { kind: "service" } },
    };
  }

  const userId = await getUserId(req);
  if (!userId) {
    return { ok: false, response: errorResponse(req, "Unauthorized", 401) };
  }

  if (userId !== meeting.user_id) {
    console.warn("acesso negado a reuniao de outro usuario", {
      request_id: requestId(req),
      meeting_id: meetingId,
      caller: userId,
    });
    return { ok: false, response: errorResponse(req, "Forbidden", 403) };
  }

  return {
    ok: true,
    value: { meetingId: meeting.id, ownerId: meeting.user_id, caller: { kind: "user", userId } },
  };
}

export interface JoinTokenResult {
  meetingId: string;
  ownerId: string;
  title: string;
  meetingStatus: string | null;
}

/**
 * Autoriza o convidado pelo join_token da reunião.
 *
 * Usa a RPC verify_join_token (SECURITY DEFINER), porque `join_token` deixou
 * de ser legível pelo papel anônimo na migration da Fase 1.
 */
export async function verifyJoinToken(
  supabase: SupabaseClient,
  meetingId: string,
  token: string | null | undefined,
): Promise<JoinTokenResult | null> {
  if (!meetingId || !token) return null;

  const { data, error } = await supabase.rpc("verify_join_token", {
    _meeting_id: meetingId,
    _token: token,
  });

  if (error) {
    console.error("verify_join_token falhou", { code: error.code });
    return null;
  }

  const linhas = (data ?? []) as Array<{
    meeting_id: string;
    user_id: string;
    title: string;
    meeting_status: string | null;
  }>;
  if (linhas.length === 0) return null;

  const linha = linhas[0];
  return {
    meetingId: linha.meeting_id,
    ownerId: linha.user_id,
    title: linha.title,
    meetingStatus: linha.meeting_status,
  };
}

/**
 * Aceita dono autenticado OU convidado com join_token válido.
 * Usada pelas funções que atendem a sala (token do LiveKit, transcrição).
 */
export async function requireMeetingAccess(
  req: Request,
  supabase: SupabaseClient,
  meetingId: string,
  joinToken: string | null | undefined,
): Promise<{ ok: true; value: MeetingOwnership } | { ok: false; response: Response }> {
  if (!meetingId) {
    return { ok: false, response: errorResponse(req, "meeting_id is required", 400) };
  }

  const convidado = await verifyJoinToken(supabase, meetingId, joinToken);
  if (convidado) {
    if (convidado.meetingStatus === "ended") {
      return { ok: false, response: errorResponse(req, "Meeting has ended", 410) };
    }
    return {
      ok: true,
      value: {
        meetingId: convidado.meetingId,
        ownerId: convidado.ownerId,
        caller: { kind: "guest", meetingId: convidado.meetingId },
      },
    };
  }

  return await requireMeetingOwner(req, supabase, meetingId);
}

/**
 * Autoriza o cron.
 *
 * Aceita o header x-cron-secret (caminho novo, usado pela agenda versionada
 * da Fase 2) ou a service key (caminho atual do pg_cron configurado à mão).
 * Manter os dois evita derrubar briefings e lembretes já agendados.
 */
export function isCronCaller(req: Request): boolean {
  const configurado = Deno.env.get("CRON_SECRET");
  const enviado = req.headers.get("x-cron-secret");
  if (configurado && enviado && timingSafeEqual(enviado, configurado)) return true;
  return isServiceRole(req);
}

export function requireCron(
  req: Request,
): { ok: true } | { ok: false; response: Response } {
  if (!isCronCaller(req)) {
    return { ok: false, response: errorResponse(req, "Unauthorized", 401) };
  }
  return { ok: true };
}
