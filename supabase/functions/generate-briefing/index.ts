import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente executivo que prepara briefings pré-reunião.

REGRA FUNDAMENTAL: Use SOMENTE as informações fornecidas pelo usuário. NUNCA invente, suponha ou adicione informações que não foram explicitamente passadas. Se um dado não foi informado, diga "não informado" — nunca preencha com suposições.

Com base nos dados recebidos, gere um briefing conciso com:
1. **Objetivo** — resuma o propósito da reunião com base no título e descrição fornecidos
2. **Participantes** — liste apenas os nomes/emails informados, sem inventar cargos ou perfis
3. **Pauta** — organize os tópicos mencionados na descrição. Se não houver descrição, diga "Pauta não definida pelo organizador"
4. **Perguntas sugeridas** — 2-3 perguntas baseadas EXCLUSIVAMENTE nos tópicos da pauta informada
5. **Logística** — horário, duração e organizador conforme informado

Formato: Markdown. Máximo 200 palavras. Seja direto e factual. Não invente contexto.`;

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
    const body = await response.text();
    console.error("AI gateway error:", status, body);
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error("AI_FAILED");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { meeting_id } = body;

    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Preview mode: generate suggestions for meeting creation ──
    if (meeting_id === "__preview__" && body.preview_data) {
      const pd = body.preview_data;

      const previewPrompt = `Voce e um assistente de reunioes. Com base nas informacoes fornecidas pelo usuario, elabore:
1. Um objetivo claro em 1 frase — baseado no titulo, tipo e no que o usuario ja escreveu
2. Uma pauta com 4-6 topicos numerados — expandindo e detalhando o que o usuario informou

REGRA: Use SOMENTE as informacoes fornecidas. Expanda e organize o que foi escrito, mas NUNCA invente temas que nao tenham relacao com o que foi informado.`;

      const tools = [
        {
          type: "function",
          function: {
            name: "suggest_meeting",
            description: "Return meeting objective and agenda suggestions",
            parameters: {
              type: "object",
              properties: {
                objective: { type: "string", description: "Clear meeting objective in 1 sentence" },
                agenda: { type: "string", description: "Numbered agenda items separated by newlines" },
              },
              required: ["objective", "agenda"],
              additionalProperties: false,
            },
          },
        },
      ];

      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "AI not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: previewPrompt },
            { role: "user", content: `Titulo: ${pd.title}\nTipo: ${pd.type}\nDuracao: ${pd.duration} min\nParticipantes: ${(pd.attendees || []).length}${pd.objective ? `\nObjetivo informado: ${pd.objective}` : ""}${pd.agenda ? `\nPauta informada: ${pd.agenda}` : ""}` },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "suggest_meeting" } },
        }),
      });

      if (!response.ok) {
        const status = response.status;
        await response.text();
        return new Response(JSON.stringify({ error: status === 429 ? "Rate limited, tente novamente" : "AI generation failed" }), {
          status: status === 429 ? 429 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      let preview;
      try {
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          preview = JSON.parse(toolCall.function.arguments);
        } else {
          // Fallback: parse content as JSON
          const content = data.choices?.[0]?.message?.content ?? "{}";
          preview = JSON.parse(content);
        }
      } catch {
        preview = { objective: "", agenda: data.choices?.[0]?.message?.content ?? "" };
      }

      return new Response(
        JSON.stringify({ success: true, preview }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch meeting
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch user settings for custom prompt
    const { data: settings } = await supabase
      .from("user_settings")
      .select("custom_pre_prompt")
      .eq("user_id", meeting.user_id)
      .single();

    const systemPrompt = settings?.custom_pre_prompt || DEFAULT_SYSTEM_PROMPT;

    // 3. Build user message
    const start = new Date(meeting.starts_at);
    const end = meeting.ends_at ? new Date(meeting.ends_at) : null;
    const durationMin = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
    const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];

    const userMessage = `Reunião: ${meeting.title}
Data/Hora: ${start.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
${durationMin ? `Duração: ${durationMin} minutos` : ""}
Organizador: ${meeting.organizer || "Não informado"}
Participantes: ${attendees.length > 0 ? attendees.join(", ") : "Não informados"}
${meeting.description ? `Descrição/Pauta: ${meeting.description}` : "Sem descrição disponível."}`;

    // 4. Call Lovable AI
    const contentMd = await callAI(systemPrompt, userMessage);

    // 5. Save briefing
    const { data: briefing, error: insertErr } = await supabase
      .from("briefings")
      .insert({
        meeting_id,
        type: "pre",
        content_md: contentMd,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Insert briefing error:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to save briefing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Update meeting
    await supabase
      .from("meetings")
      .update({ briefing_sent: true })
      .eq("id", meeting_id);

    return new Response(
      JSON.stringify({ success: true, briefing_id: briefing.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    const status = msg === "RATE_LIMITED" ? 429 : msg === "PAYMENT_REQUIRED" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg === "RATE_LIMITED" ? "Rate limited, tente novamente" : msg === "PAYMENT_REQUIRED" ? "Creditos esgotados" : "Internal server error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
