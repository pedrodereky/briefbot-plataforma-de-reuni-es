import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WebhookReceiver } from "npm:livekit-server-sdk@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";

/**
 * Webhook do LiveKit.
 *
 * Dois defeitos somados faziam esta função nunca executar (auditoria P0 itens
 * 4 e 5):
 *
 *   1. `config.toml` não declarava `verify_jwt = false`, então o gateway do
 *      Supabase rejeitava a requisição antes da função rodar. Corrigido na
 *      Fase 0.
 *
 *   2. A assinatura era verificada com LIVEKIT_API_KEY/SECRET de ambiente,
 *      enquanto todo o resto do sistema usa chaves POR USUÁRIO guardadas no
 *      Vault. Para qualquer cliente que fez o onboarding com as próprias
 *      credenciais, `receiver.receive()` falhava sempre.
 *
 * Consequência: `meeting_status` nunca virava live/ended por evento, o resumo
 * automático não disparava e a página de Gravações — que filtra por reuniões
 * encerradas — ficava vazia.
 *
 * A correção precisa saber DE QUEM é o evento antes de poder verificá-lo. O
 * corpo é lido sem confiança apenas para extrair o nome da sala e localizar o
 * dono; a partir daí a assinatura é verificada com as chaves desse dono, e
 * nada é feito antes de a verificação passar.
 */

interface EventoNaoConfiavel {
  room?: { name?: string };
  egressInfo?: { egressId?: string; roomName?: string };
}

/** Extrai o nome da sala do corpo ainda NÃO verificado, só para achar a chave. */
function extrairNomeDaSala(corpo: string): string | null {
  try {
    const bruto = JSON.parse(corpo) as EventoNaoConfiavel;
    return bruto.room?.name ?? bruto.egressInfo?.roomName ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const ok = () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.text();
    const authHeader = req.headers.get("authorization") || "";

    // ── Passo 1: descobrir a sala sem confiar no conteúdo ────────────────────
    const roomName = extrairNomeDaSala(body);
    if (!roomName) {
      console.log("Webhook sem nome de sala; ignorado");
      return ok();
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, user_id, meeting_status, recording_egress_id")
      .eq("livekit_room_name", roomName)
      .maybeSingle();

    if (!meeting) {
      console.log(`Nenhuma reunião para a sala: ${roomName}`);
      return ok();
    }

    // ── Passo 2: verificar a assinatura com as chaves DO DONO ───────────────
    const [keyRes, secretRes] = await Promise.all([
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_key" }),
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_secret" }),
    ]);

    const apiKey = (keyRes.data as string | null) || Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = (secretRes.data as string | null) || Deno.env.get("LIVEKIT_API_SECRET");

    if (!apiKey || !apiSecret) {
      console.error("Sem credenciais LiveKit para verificar o webhook", {
        meeting_id: meeting.id,
      });
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);

    let event;
    try {
      // Só aqui o conteúdo passa a ser confiável.
      event = await receiver.receive(body, authHeader);
    } catch (err) {
      console.error("Assinatura de webhook inválida", {
        room: roomName,
        erro: err instanceof Error ? err.message : "desconhecido",
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    switch (event.event) {
      case "room_started": {
        await supabase
          .from("meetings")
          .update({ meeting_status: "live" })
          .eq("id", meeting.id);
        console.log(`Meeting ${meeting.id} is now live`);
        break;
      }

      case "room_finished": {
        // Only update status if not already ended (end-meeting function handles deliverables)
        const currentStatus = meeting.meeting_status || "live";
        if (currentStatus !== "ended") {
          await supabase
            .from("meetings")
            .update({ meeting_status: "ended" })
            .eq("id", meeting.id);
          console.log(`Meeting ${meeting.id} ended via webhook`);

          // Generate summary only if end-meeting didn't already handle it
          const { data: existingSummary } = await supabase
            .from("briefings")
            .select("id")
            .eq("meeting_id", meeting.id)
            .eq("type", "post")
            .limit(1);

          if (!existingSummary || existingSummary.length === 0) {
            const { data: transcripts } = await supabase
              .from("meeting_transcripts")
              .select("participant_name, text, timestamp")
              .eq("meeting_id", meeting.id)
              .eq("is_final", true)
              .order("timestamp", { ascending: true });

            if (transcripts && transcripts.length > 0) {
              const transcriptText = transcripts
                .map((t) => `${t.participant_name}: ${t.text}`)
                .join("\n");

              const summaryUrl = `${supabaseUrl}/functions/v1/generate-summary`;
              await fetch(summaryUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  meeting_id: meeting.id,
                  transcript: transcriptText,
                  auto_from_transcript: true,
                }),
              });
              console.log(`Auto-summary triggered for meeting ${meeting.id}`);
            }
          } else {
            console.log(`Summary already exists for meeting ${meeting.id}, skipping`);
          }
        } else {
          console.log(`Meeting ${meeting.id} already ended, skipping webhook processing`);
        }
        break;
      }

      // ── Gravação concluída ──────────────────────────────────────────────
      // É AQUI que a URL do arquivo aparece, e não no retorno de stopEgress:
      // quando o egress é encerrado o arquivo ainda está sendo processado e
      // enviado ao destino. Era por isso que `recording_url` nunca era
      // preenchida de forma confiável (auditoria P1 item 10).
      case "egress_ended":
      case "egress_updated": {
        const egress = event.egressInfo;
        if (!egress) break;

        const arquivo = egress.fileResults?.[0];
        const url = arquivo?.location || null;

        // EgressStatus: 3 = COMPLETE, 4 = FAILED (enum do LiveKit)
        const concluido = egress.status === 3;
        const falhou = egress.status === 4;

        if (concluido && url) {
          await supabase
            .from("meetings")
            .update({
              recording_url: url,
              recording_status: "ready",
              recording_egress_id: null,
              recording_ended_at: new Date().toISOString(),
            })
            .eq("id", meeting.id);
          console.log(`Gravação disponível para ${meeting.id}`);
        } else if (falhou) {
          await supabase
            .from("meetings")
            .update({
              recording_status: "failed",
              recording_egress_id: null,
              recording_ended_at: new Date().toISOString(),
            })
            .eq("id", meeting.id);
          console.error(`Egress falhou para ${meeting.id}`, { egress_id: egress.egressId });
        }
        break;
      }

      case "participant_joined": {
        console.log(`Participant joined room ${roomName}: ${event.participant?.identity}`);
        break;
      }

      case "participant_left": {
        console.log(`Participant left room ${roomName}: ${event.participant?.identity}`);
        break;
      }
    }

    return ok();
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
