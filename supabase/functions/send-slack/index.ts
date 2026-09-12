import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { requireMeetingOwner } from "../_shared/auth.ts";


function mdToMrkdwn(md: string): string {
  return md
    // Headers → bold
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Bold **text** → *text*
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    // Unordered lists
    .replace(/^[-*]\s+/gm, "• ")
    // Trim to ~800 chars
    .slice(0, 800);
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { briefing_id } = await req.json();
    if (!briefing_id) {
      return new Response(JSON.stringify({ error: "briefing_id is required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch briefing
    const { data: briefing, error: bErr } = await supabase
      .from("briefings")
      .select("*")
      .eq("id", briefing_id)
      .single();

    if (bErr || !briefing) {
      return new Response(JSON.stringify({ error: "Briefing not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 2. Fetch meeting
    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", briefing.meeting_id)
      .single();

    // Autorização (auditoria P0 item 2): sem isto, qualquer um que soubesse um
    // briefing_id disparava mensagem no Slack da empresa de outro usuário.
    const autorizacao = await requireMeetingOwner(req, supabase, briefing.meeting_id);
    if (!autorizacao.ok) return autorizacao.response;

    if (mErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 3. Fetch user settings
    const { data: settings } = await supabase
      .from("user_settings")
      .select("slack_webhook_url, slack_enabled")
      .eq("user_id", meeting.user_id)
      .single();

    if (!settings?.slack_webhook_url) {
      return new Response(JSON.stringify({ error: "Slack webhook URL not configured" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (settings.slack_enabled === false) {
      return new Response(JSON.stringify({ error: "Slack is disabled" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 4. Convert markdown to mrkdwn
    const mrkdwnContent = mdToMrkdwn(briefing.content_md);
    const attendees = Array.isArray(meeting.attendees) ? meeting.attendees as string[] : [];

    const startDate = new Date(meeting.starts_at);
    const dateStr = startDate.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emoji = briefing.type === "pre" ? "📋 Briefing" : "✅ Ata";
    const appUrl = Deno.env.get("APP_URL") || "https://briefbot.app";

    // Add "Ver completo" link if content was truncated
    const fullContent = briefing.content_md.length > 800
      ? `${mrkdwnContent}…\n\n<${appUrl}/meetings/${meeting.id}|Ver completo →>`
      : mrkdwnContent;

    // 5. Build Block Kit payload
    const payload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji}: ${meeting.title}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: fullContent,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 ${dateStr} • ${attendees.length} participante${attendees.length !== 1 ? "s" : ""} • BriefBot`,
            },
          ],
        },
      ],
    };

    // 6. POST to Slack webhook
    const slackRes = await fetch(settings.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      console.error("Slack webhook error:", slackRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to send Slack message" }), {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    await slackRes.text(); // consume body

    // 7. Update briefing channels
    await supabase
      .from("briefings")
      .update({
        channels: [...(briefing.channels ?? []), "slack"],
      })
      .eq("id", briefing_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
