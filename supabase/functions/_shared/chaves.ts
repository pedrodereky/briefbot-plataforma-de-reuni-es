import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * De quem são as chaves de API que uma reunião usa.
 *
 * Com organizações, as chaves são da EMPRESA, e a empresa é representada pelo
 * dono da organização. Resolver pelo criador da reunião faria cada membro
 * precisar cadastrar Deepgram e LiveKit por conta própria — e a primeira
 * reunião de quem acabou de entrar na equipe falharia sem explicação.
 *
 * `org_id` nulo só acontece em linha anterior à migração de organizações; aí
 * cai no criador, que era o comportamento antigo.
 */
export async function contaDasChaves(
  supabase: SupabaseClient,
  meeting: { user_id: string; org_id?: string | null },
): Promise<string> {
  if (!meeting.org_id) return meeting.user_id;

  const { data, error } = await supabase.rpc("dono_da_org", { p_org: meeting.org_id });

  if (error || !data) {
    // `dono_da_org` é exclusiva do service_role. Uma function que chegue aqui
    // com cliente de usuário não deve ficar sem chave nenhuma: cai no criador
    // e registra, porque é sintoma de chamada com o cliente errado.
    console.warn("dono_da_org indisponível, usando o criador da reunião", {
      org_id: meeting.org_id,
      code: error?.code,
    });
    return meeting.user_id;
  }

  return data as string;
}

/**
 * Mesma coisa, quando só o id da reunião está à mão.
 *
 * É o caso do convidado: `verify_join_token` devolve dono, título e status,
 * mas não a organização — e estender a RPC exigiria outra migration por uma
 * consulta que cabe aqui.
 */
export async function contaDasChavesPorReuniao(
  supabase: SupabaseClient,
  meetingId: string,
  donoDaReuniao: string,
): Promise<string> {
  const { data } = await supabase
    .from("meetings")
    .select("user_id, org_id")
    .eq("id", meetingId)
    .maybeSingle();

  if (!data) return donoDaReuniao;
  return await contaDasChaves(supabase, data as { user_id: string; org_id: string | null });
}
