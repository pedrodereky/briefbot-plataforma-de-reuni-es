import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { requireMeetingOwner } from "../_shared/auth.ts";


const DEFAULT_SYSTEM_PROMPT = `Você é um assistente especializado em extrair valor de transcrições.
Gere uma ata estruturada com:
1. Resumo executivo — 2-3 frases do que foi decidido
2. Decisões tomadas — lista numerada
3. Action items — formato: [RESPONSÁVEL] → [AÇÃO] → [PRAZO]
   Detecte gatilhos como: "vou agendar", "precisa fazer", "fica responsável", "manda email",
   "até sexta", "verificar", "resolver", "acompanhar", "follow-up", "marca reunião".
   Se não houver prazo explícito, use "Sem prazo".
   Se o responsável não for claro, use "A definir".
4. Próxima reunião — se mencionada
5. Pendências — pontos não resolvidos

Ignore conversas paralelas. Foque no que tem impacto prático.
Formato: Markdown.`;

function parseActionItems(markdown: string): Array<{ owner: string; task: string; due_date: string | null }> {
  const items: Array<{ owner: string; task: string; due_date: string | null }> = [];
  const regex = /\[([^\]]+)\]\s*→\s*\[([^\]]+)\]\s*→\s*\[([^\]]*)\]/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const owner = match[1].trim();
    const task = match[2].trim();
    const rawDate = match[3].trim();
    let due_date: string | null = null;
    if (rawDate && rawDate.toLowerCase() !== "sem prazo" && rawDate !== "-") {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        due_date = parsed.toISOString().split("T")[0];
      }
    }
    items.push({ owner, task, due_date });
  }
  return items;
}

function buildUserMessage(transcript: string, context: Record<string, string>): string {
  let msg = "";
  if (context.objective) msg += `Objetivo da reuniao: ${context.objective}\n\n`;
  if (context.key_points) msg += `Pontos-chave informados pelo organizador:\n${context.key_points}\n\n`;
  if (context.decisions) msg += `Decisoes informadas pelo organizador:\n${context.decisions}\n\n`;
  msg += `Transcript:\n\n${transcript}`;
  if (context.objective || context.key_points || context.decisions) {
    msg += `\n\nIMPORTANTE: Use o contexto fornecido pelo organizador acima para enriquecer a ata.`;
  }
  return msg;
}

async function callAI(systemPrompt: string, userMessage: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    await response.text();
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error("AI_FAILED");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Autorização (auditoria P0 item 2): aceita a cadeia interna (service key)
    // e o dono da reunião; qualquer outro chamador recebe 403.
    const autorizacao = await requireMeetingOwner(req, supabase, body.meeting_id);
    if (!autorizacao.ok) return autorizacao.response;

    let meetingId: string;
    let userId: string;
    let transcriptText: string;
    const userContext = body.user_context || {};

    // ── Mode 0: Use live transcript from meeting_transcripts table ──
    if (body.use_live_transcript && body.meeting_id) {
      const { data: meeting, error } = await supabase
        .from("meetings")
        .select("id, user_id")
        .eq("id", body.meeting_id)
        .single();

      if (error || !meeting) {
        return new Response(JSON.stringify({ error: "Meeting not found" }), {
          status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      meetingId = meeting.id;
      userId = meeting.user_id;

      const { data: transcripts } = await supabase
        .from("meeting_transcripts")
        .select("participant_name, text")
        .eq("meeting_id", meetingId)
        .eq("is_final", true)
        .order("timestamp", { ascending: true });

      if (!transcripts || transcripts.length === 0) {
        return new Response(JSON.stringify({ error: "No live transcript found" }), {
          status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      transcriptText = transcripts.map((t) => `${t.participant_name}: ${t.text}`).join("\n");

    // ── Mode 1: Manual transcript ──
    } else if (body.meeting_id) {
      if (!body.transcript?.trim()) {
        return new Response(JSON.stringify({ error: "transcript is required" }), {
          status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: meeting, error } = await supabase
        .from("meetings")
        .select("id, user_id")
        .eq("id", body.meeting_id)
        .single();

      if (error || !meeting) {
        return new Response(JSON.stringify({ error: "Meeting not found" }), {
          status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      meetingId = meeting.id;
      userId = meeting.user_id;
      transcriptText = body.transcript;
    } else {
      return new Response(JSON.stringify({ error: "Provide meeting_id" }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch user settings for custom prompt
    const { data: settings } = await supabase
      .from("user_settings")
      .select("custom_post_prompt")
      .eq("user_id", userId)
      .single();

    const systemPrompt = settings?.custom_post_prompt || DEFAULT_SYSTEM_PROMPT;

    // Call Lovable AI
    const contentMd = await callAI(systemPrompt, buildUserMessage(transcriptText, userContext));

    // Save briefing (type: post)
    const { error: insertErr } = await supabase
      .from("briefings")
      .insert({
        meeting_id: meetingId,
        type: "post",
        content_md: contentMd,
        sent_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("Insert summary error:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to save summary" }), {
        status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Parse and insert action items (dedup against existing real-time detections)
    const actionItems = parseActionItems(contentMd);
    if (actionItems.length > 0) {
      const { data: existingItems } = await supabase
        .from("action_items")
        .select("task")
        .eq("meeting_id", meetingId);

      const existingTasks = (existingItems || []).map((i) => i.task.toLowerCase().substring(0, 30));

      const newItems = actionItems.filter((item) => {
        const prefix = item.task.toLowerCase().substring(0, 30);
        return !existingTasks.some((et) => et.includes(prefix) || prefix.includes(et));
      });

      if (newItems.length > 0) {
        const rows = newItems.map((item) => ({
          meeting_id: meetingId,
          owner: item.owner,
          task: item.task,
          due_date: item.due_date,
        }));
        const { error: aiErr } = await supabase.from("action_items").insert(rows);
        if (aiErr) console.error("Insert action items error:", aiErr);
      }
    }

    // Update meeting
    await supabase.from("meetings").update({ summary_sent: true }).eq("id", meetingId);

    return new Response(
      JSON.stringify({ success: true, action_items_count: actionItems.length }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    const status = msg === "RATE_LIMITED" ? 429 : msg === "PAYMENT_REQUIRED" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg === "RATE_LIMITED" ? "Rate limited, tente novamente" : msg === "PAYMENT_REQUIRED" ? "Creditos esgotados" : "Internal server error" }), {
      status, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
