import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
