import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from "npm:livekit-server-sdk@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { contaDasChaves } from "../_shared/chaves.ts";
import { requireMeetingOwner } from "../_shared/auth.ts";

/**
 * Início e parada da gravação.
 *
 * Dois problemas fechados aqui (auditoria P1 itens 9 e 10):
 *
 *   1. O egress era criado com `{ file: { filepath } }` e NENHUM destino de
 *      armazenamento. Sem destino o arquivo não é entregue a lugar nenhum
 *      persistente — a gravação "acontecia" e desaparecia. Agora o destino S3
 *      é obrigatório e, quando não configurado, a função recusa de forma
 *      explícita em vez de fingir que gravou.
 *
 *   2. `recording_url` era lida do retorno de `stopEgress()`. Nesse instante o
 *      arquivo ainda está sendo processado e enviado, então o campo vinha
 *      vazio quase sempre. A URL passou a ser gravada pelo webhook, no evento
 *      `egress_ended`, que é quando ela existe de fato.
 *
 * Configuração do destino (variáveis de ambiente das edge functions):
 *   RECORDING_S3_BUCKET, RECORDING_S3_REGION, RECORDING_S3_ACCESS_KEY,
 *   RECORDING_S3_SECRET, RECORDING_S3_ENDPOINT (opcional, para S3-compatível
 *   como o Storage do próprio Supabase), RECORDING_S3_FORCE_PATH_STYLE.
 */

interface DestinoS3 {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

function lerDestinoS3(): DestinoS3 | null {
  const bucket = Deno.env.get("RECORDING_S3_BUCKET");
  const region = Deno.env.get("RECORDING_S3_REGION");
  const accessKey = Deno.env.get("RECORDING_S3_ACCESS_KEY");
  const secret = Deno.env.get("RECORDING_S3_SECRET");

  if (!bucket || !region || !accessKey || !secret) return null;

  const endpoint = Deno.env.get("RECORDING_S3_ENDPOINT") || undefined;
  return {
    bucket,
    region,
    accessKey,
    secret,
    endpoint,
    // Endpoints S3-compatíveis (Supabase Storage, MinIO) exigem path style.
    forcePathStyle:
      (Deno.env.get("RECORDING_S3_FORCE_PATH_STYLE") ?? (endpoint ? "true" : "false")) === "true",
  };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const responder = (corpo: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const { meeting_id, action } = await req.json();

    if (!meeting_id || !action) {
      return responder({ error: "meeting_id and action (start|stop) required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Autorização (auditoria P0 item 2): gravar custa dinheiro na conta LiveKit
    // do dono — sem esta checagem, qualquer um iniciava gravação alheia.
    const autorizacao = await requireMeetingOwner(req, supabase, meeting_id);
    if (!autorizacao.ok) return autorizacao.response;

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return responder({ error: "Meeting not found" }, 404);
    }

    // As chaves são da organização, representada pelo dono dela.
    const contaDeChaves = await contaDasChaves(supabase, meeting);

    const [keyRes, secretRes, urlRes] = await Promise.all([
      supabase.rpc("get_user_secret", { _user_id: contaDeChaves, _service: "livekit_api_key" }),
      supabase.rpc("get_user_secret", { _user_id: contaDeChaves, _service: "livekit_api_secret" }),
      supabase.rpc("get_user_secret", { _user_id: contaDeChaves, _service: "livekit_url" }),
    ]);
    const apiKey = (keyRes.data as string | null) || Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = (secretRes.data as string | null) || Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = (urlRes.data as string | null) || Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      return responder({ error: "LiveKit not configured" }, 500);
    }

    const livekitHost = livekitUrl.replace("wss://", "https://");
    const roomName = meeting.livekit_room_name;

    if (!roomName) {
      return responder({ error: "No LiveKit room for this meeting" }, 400);
    }

    const egressClient = new EgressClient(livekitHost, apiKey, apiSecret);

    if (action === "start") {
      const destino = lerDestinoS3();
      if (!destino) {
        // Falhar aqui é melhor que gravar para lugar nenhum: antes o egress
        // subia sem destino e o arquivo simplesmente não existia depois.
        return responder({
          success: false,
          error: "Armazenamento de gravação não configurado.",
          hint:
            "Defina RECORDING_S3_BUCKET, RECORDING_S3_REGION, RECORDING_S3_ACCESS_KEY " +
            "e RECORDING_S3_SECRET nas variáveis das edge functions.",
        }, 503);
      }

      const fileName = `recordings/${meeting_id}-${Date.now()}.mp4`;

      const saida = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: fileName,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: destino.accessKey,
            secret: destino.secret,
            bucket: destino.bucket,
            region: destino.region,
            ...(destino.endpoint ? { endpoint: destino.endpoint } : {}),
            forcePathStyle: destino.forcePathStyle,
          }),
        },
      });

      let egress;
      try {
        egress = await egressClient.startRoomCompositeEgress(roomName, { file: saida });
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "erro desconhecido";
        console.error("Egress start error:", mensagem);
        return responder({
          success: false,
          error: "Recording not available.",
          hint: "Egress do LiveKit exige plano pago. Verifique seu plano em cloud.livekit.io.",
        }, 502);
      }

      // O erro do update passou a ser checado: era exatamente assim que a
      // gravação sumia sem ninguém perceber.
      const { error: updateErr } = await supabase
        .from("meetings")
        .update({
          recording_egress_id: egress.egressId,
          recording_status: "recording",
          recording_started_at: new Date().toISOString(),
          recording_url: null,
        })
        .eq("id", meeting_id);

      if (updateErr) {
        console.error("Falha ao registrar egress na reunião", {
          meeting_id,
          code: updateErr.code,
        });
        // Sem registro não há como parar nem recuperar a gravação depois.
        try {
          await egressClient.stopEgress(egress.egressId);
        } catch {
          // best effort
        }
        return responder({ success: false, error: "Failed to persist recording state" }, 500);
      }

      return responder({ success: true, egress_id: egress.egressId, status: "recording" });
    }

    if (action === "stop") {
      const egressId = meeting.recording_egress_id;
      if (!egressId) {
        return responder({ success: true, status: "no_active_recording" });
      }

      try {
        await egressClient.stopEgress(egressId);
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "erro desconhecido";
        console.error("Egress stop error:", mensagem);
        // Pode já ter parado sozinho; o webhook ainda assim fecha o ciclo.
      }

      // A URL NÃO é lida aqui: o arquivo ainda está sendo processado e enviado
      // ao destino. Quem grava `recording_url` é o webhook, no evento
      // `egress_ended`. Até lá o estado é "processing".
      const { error: updateErr } = await supabase
        .from("meetings")
        .update({ recording_status: "processing" })
        .eq("id", meeting_id);

      if (updateErr) {
        console.error("Falha ao marcar gravação como em processamento", {
          meeting_id,
          code: updateErr.code,
        });
      }

      return responder({ success: true, status: "processing" });
    }

    return responder({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("Recording error:", err);
    return responder(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
});
