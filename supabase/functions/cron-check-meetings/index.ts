import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { requireCron } from "../_shared/auth.ts";


Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Autorização (auditoria P0 item 2): rota sem verify_jwt no gateway.
  // Aceita o header x-cron-secret (agenda versionada da Fase 2) ou a service
  // key (pg_cron configurado à mão hoje) — nunca uma requisição anônima.
  const cron = requireCron(req);
  if (!cron.ok) return cron.response;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find meetings starting in the next 35 minutes without a briefing
    const now = new Date();
    const later = new Date(now.getTime() + 35 * 60 * 1000);

    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("id, title")
      .eq("briefing_sent", false)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", later.toISOString());

    if (error) throw error;

    const results = [];
    for (const meeting of meetings ?? []) {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-briefing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ meeting_id: meeting.id }),
      });
      const data = await res.json();
      results.push({ meeting_id: meeting.id, title: meeting.title, success: data.success ?? false });
    }

    // Trigger reminders
    let reminderResult = { reminders_sent: 0 };
    try {
      const reminderRes = await fetch(`${supabaseUrl}/functions/v1/send-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      });
      reminderResult = await reminderRes.json();
    } catch (err) {
      console.error("Reminder trigger error:", err);
    }

    return new Response(
      JSON.stringify({ processed: results.length, results, reminders: reminderResult }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
