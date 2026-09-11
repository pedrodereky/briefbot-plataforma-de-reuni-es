import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { requireMeetingOwner } from "../_shared/auth.ts";


const SYSTEM_PROMPT = `Você é um detector de action items em transcrições de reuniões.
Analise o trecho da transcrição e extraia APENAS itens acionáveis claros.

Gatilhos comuns:
- "vou agendar", "precisa agendar", "marca aí"
- "fica responsável", "você faz", "eu faço"
- "precisa enviar", "manda um email"
- "até sexta", "prazo", "deadline"
- "resolver isso", "verificar", "checar"
- "fazer follow-up", "acompanhar"

Retorne APENAS action items encontrados no formato:
[RESPONSÁVEL] → [AÇÃO] → [PRAZO]

Se não houver prazo, use "Sem prazo".
Se o responsável não for claro, use "A definir".
Se NÃO houver nenhum action item, responda apenas: NENHUM

Seja conservador: só extraia itens com intenção clara de ação.`;

function parseActionItems(text: string): Array<{ owner: string; task: string; due_date: string | null }> {
  if (text.trim() === "NENHUM") return [];
  const items: Array<{ owner: string; task: string; due_date: string | null }> = [];
  const regex = /\[([^\]]+)\]\s*→\s*\[([^\]]+)\]\s*→\s*\[([^\]]*)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
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

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { meeting_id, since_timestamp } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Autorização (auditoria P0 item 2): esta função opera com a service key,
    // que ignora RLS. Sem esta checagem, qualquer um que soubesse o UUID de
    // uma reunião agia sobre ela. Aceita a cadeia interna (service key) e o
    // dono da reunião; qualquer outro recebe 403.
    const autorizacao = await requireMeetingOwner(req, supabase, meeting_id);
    if (!autorizacao.ok) return autorizacao.response;


    // Fetch recent transcript entries
    let query = supabase
      .from("meeting_transcripts")
      .select("participant_name, text, timestamp")
      .eq("meeting_id", meeting_id)
      .eq("is_final", true)
      .order("timestamp", { ascending: true });

    if (since_timestamp) {
      query = query.gt("timestamp", since_timestamp);
    }

    const { data: transcripts, error: tErr } = await query;
    if (tErr) throw tErr;

    if (!transcripts || transcripts.length === 0) {
      return new Response(JSON.stringify({ action_items: [], processed: 0 }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const transcriptText = transcripts.map((t) => `${t.participant_name}: ${t.text}`).join("\n");

    // Call AI
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcriptText },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
      if (status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
      throw new Error("AI_FAILED");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";
    const actionItems = parseActionItems(content);

    // Insert new items, checking for duplicates by task text
    const inserted: typeof actionItems = [];
    for (const item of actionItems) {
      // Check if similar task already exists for this meeting
      const { data: existing } = await supabase
        .from("action_items")
        .select("id")
        .eq("meeting_id", meeting_id)
        .ilike("task", `%${item.task.substring(0, 30)}%`)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error: insErr } = await supabase.from("action_items").insert({
          meeting_id,
          owner: item.owner,
          task: item.task,
          due_date: item.due_date,
        });
        if (!insErr) inserted.push(item);
      }
    }

    const lastTimestamp = transcripts[transcripts.length - 1]?.timestamp || null;

    return new Response(
      JSON.stringify({
        action_items: inserted,
        processed: transcripts.length,
        last_timestamp: lastTimestamp,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("detect-action-items error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
