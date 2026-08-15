import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Voce e um analista de reunioes. Analise a transcricao e retorne os insights.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: meeting } = await supabase
      .from("meetings")
      .select("user_id")
      .eq("id", meeting_id)
      .single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transcripts } = await supabase
      .from("meeting_transcripts")
      .select("participant_name, text")
      .eq("meeting_id", meeting_id)
      .eq("is_final", true)
      .order("timestamp", { ascending: true });

    if (!transcripts || transcripts.length === 0) {
      return new Response(JSON.stringify({ error: "No transcripts found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptText = transcripts.map((t) => `${t.participant_name}: ${t.text}`).join("\n");

    // Call Lovable AI with tool calling for structured output
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcriptText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_insights",
              description: "Report meeting insights analysis",
              parameters: {
                type: "object",
                properties: {
                  topics: { type: "array", items: { type: "string" }, description: "Main topics discussed" },
                  sentiment: { type: "string", description: "Overall sentiment summary in 1-2 sentences" },
                  score: { type: "number", description: "Meeting effectiveness score 1-10" },
                  justification: { type: "string", description: "Score justification in 1-2 sentences" },
                },
                required: ["topics", "sentiment", "score", "justification"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_insights" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      await response.text();
      return new Response(JSON.stringify({ error: status === 429 ? "Rate limited" : "AI generation failed" }), {
        status: status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let insights;
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        insights = JSON.parse(toolCall.function.arguments);
      } else {
        const rawText = data.choices?.[0]?.message?.content ?? "{}";
        insights = JSON.parse(rawText);
      }
    } catch {
      insights = { topics: [], sentiment: "Nao foi possivel analisar", score: 5, justification: "Erro no parsing" };
    }

    // Save as briefing type='insights'
    await supabase.from("briefings").insert({
      meeting_id,
      type: "insights",
      content_md: JSON.stringify(insights),
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, insights }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
