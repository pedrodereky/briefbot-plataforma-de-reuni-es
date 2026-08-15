import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const maxWindow = new Date(now.getTime() + 60 * 60 * 1000);

    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, title, starts_at, attendees, organizer, user_id")
      .eq("meeting_status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", maxWindow.toISOString());

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;

    for (const meeting of meetings) {
      const { data: existingReminder } = await supabase
        .from("briefings")
        .select("id")
        .eq("meeting_id", meeting.id)
        .eq("type", "reminder")
        .limit(1)
        .maybeSingle();

      if (existingReminder) continue;

      // Each user has their own Resend key (white-label, stored in Vault)
      const { data: settings } = await supabase
        .from("user_settings")
        .select("email_enabled, reminder_minutes_before, sender_email, sender_name")
        .eq("user_id", meeting.user_id)
        .single();

      const { data: vaultKey } = await supabase.rpc("get_user_secret", {
        _user_id: meeting.user_id,
        _service: "resend_api_key",
      });
      const resendKey = (vaultKey as string | null) || Deno.env.get("RESEND_API_KEY");
      if (!settings?.email_enabled || !resendKey) continue;

      const senderName = settings.sender_name || Deno.env.get("RESEND_SENDER_NAME") || "BriefBot";
      const senderEmail = settings.sender_email || Deno.env.get("RESEND_SENDER_EMAIL");
      if (!senderEmail) continue;

      const reminderMinutes = settings.reminder_minutes_before ?? 15;
      const meetingStart = new Date(meeting.starts_at);
      const reminderTime = new Date(meetingStart.getTime() - reminderMinutes * 60 * 1000);

      if (now < reminderTime) continue;

      const minutesUntil = Math.round((meetingStart.getTime() - now.getTime()) / 60000);
      const appUrl = Deno.env.get("APP_URL") || "https://briefbot.app";
      const joinLink = `${appUrl}/join/${meeting.id}`;

      const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
      const recipients = [...attendees];
      if (meeting.organizer && !recipients.includes(meeting.organizer)) {
        recipients.push(meeting.organizer);
      }

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Lembrete: ${meeting.title}</h2>
          <p style="color: #666;">Sua reuniao comeca em <strong>${minutesUntil} minutos</strong>.</p>
          <a href="${joinLink}" style="display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 12px;">
            Entrar na Reuniao
          </a>
        </div>
      `;

      for (const email of recipients) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${senderName} <${senderEmail}>`,
              to: [email],
              subject: `Lembrete: ${meeting.title} em ${minutesUntil} min`,
              html,
            }),
          });
        } catch (err) {
          console.error(`Error sending reminder to ${email}:`, err);
        }
      }

      await supabase.from("briefings").insert({
        meeting_id: meeting.id,
        type: "reminder",
        content_md: `Lembrete enviado ${minutesUntil} min antes para ${recipients.length} participantes.`,
        sent_at: new Date().toISOString(),
      });

      sent++;
    }

    return new Response(
      JSON.stringify({ processed: meetings.length, reminders_sent: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
