import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/http.ts";
import { requireMeetingAccess } from "../_shared/auth.ts";

/**
 * Entrega ao navegador uma chave TEMPORÁRIA do Deepgram.
 *
 * Antes (auditoria P0 item 1) esta função devolvia a chave permanente do dono
 * da conta em texto puro — qualquer um com DevTools aberto a copiava e usava
 * fora da plataforma por tempo indeterminado. Isso contrariava a premissa
 * escrita no próprio .lovable/plan.md: "o frontend nunca recebe o valor da
 * key".
 *
 * A transcrição acontece no navegador, via WebSocket direto com o Deepgram,
 * então alguma credencial precisa chegar lá. A troca é: em vez da chave mestra
 * eterna, uma chave derivada com escopo mínimo (`usage:write`) e validade de
 * 10 minutos, criada pela API do Deepgram a cada entrada na sala. Vazou? Morre
 * sozinha, e não dá acesso à conta — só a enviar áudio.
 *
 * A chave mestra nunca sai daqui.
 */

const TTL_SEGUNDOS = 600;
const ESCOPOS = ["usage:write"];

interface DeepgramProject {
  project_id: string;
}

async function obterProjectId(masterKey: string): Promise<string | null> {
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${masterKey}` },
  });
  if (!res.ok) {
    console.error("Deepgram: falha ao listar projetos", { status: res.status });
    return null;
  }
  const data = (await res.json()) as { projects?: DeepgramProject[] };
  return data.projects?.[0]?.project_id ?? null;
}

async function criarChaveTemporaria(
  masterKey: string,
  projectId: string,
): Promise<{ key: string; expiresInSeconds: number } | null> {
  const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: "POST",
    headers: {
      Authorization: `Token ${masterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comment: "BriefBot — chave efêmera de sala",
      scopes: ESCOPOS,
      time_to_live_in_seconds: TTL_SEGUNDOS,
    }),
  });

  if (!res.ok) {
    console.error("Deepgram: falha ao criar chave temporária", { status: res.status });
    return null;
  }

  const data = (await res.json()) as { key?: string };
  if (!data.key) return null;
  return { key: data.key, expiresInSeconds: TTL_SEGUNDOS };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const { meeting_id, join_token } = body as {
      meeting_id?: string;
      join_token?: string;
    };

    if (!meeting_id) {
      return errorResponse(req, "meeting_id is required", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Só quem pode estar na sala pede credencial de transcrição: dono
    // autenticado ou convidado com join_token válido.
    const acesso = await requireMeetingAccess(req, supabase, meeting_id, join_token);
    if (!acesso.ok) return acesso.response;

    // A chave mestra é sempre a do DONO da reunião — o convidado transcreve
    // na conta de quem organizou, como antes.
    const { data: segredo } = await supabase.rpc("get_user_secret", {
      _user_id: acesso.value.ownerId,
      _service: "deepgram_api_key",
    });

    const masterKey = (segredo as string | null) || Deno.env.get("DEEPGRAM_API_KEY") || "";
    if (!masterKey) {
      return errorResponse(req, "Deepgram not configured. Add your API key in Settings.", 500);
    }

    const projectId = await obterProjectId(masterKey);
    if (!projectId) {
      return errorResponse(req, "Deepgram project unavailable", 502);
    }

    const temporaria = await criarChaveTemporaria(masterKey, projectId);
    if (!temporaria) {
      return errorResponse(req, "Could not issue temporary Deepgram key", 502);
    }

    return jsonResponse(req, {
      key: temporaria.key,
      expires_in: temporaria.expiresInSeconds,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse(req, "Internal server error", 500);
  }
});
