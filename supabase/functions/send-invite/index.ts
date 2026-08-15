import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sanitizePublicUrl = (value?: string | null) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id, app_url } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Get user settings — each user has their own Resend key (white-label, in Vault)
    const { data: settings } = await supabase
      .from("user_settings")
      .select("sender_email, sender_name")
      .eq("user_id", meeting.user_id)
      .single();

    const { data: vaultKey } = await supabase.rpc("get_user_secret", {
      _user_id: meeting.user_id,
      _service: "resend_api_key",
    });
    const resendKey = (vaultKey as string | null) || Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "resend_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderName = settings?.sender_name || Deno.env.get("RESEND_SENDER_NAME") || "BriefBot";
    const senderEmail = settings?.sender_email || Deno.env.get("RESEND_SENDER_EMAIL");
    if (!senderEmail) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "sender_email_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    if (attendees.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const start = new Date(meeting.starts_at);
    const dateStr = start.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const timeStr = start.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    const appUrl =
      sanitizePublicUrl(app_url) ||
      sanitizePublicUrl(req.headers.get("origin")) ||
      sanitizePublicUrl(req.headers.get("referer")) ||
      sanitizePublicUrl(Deno.env.get("APP_URL")) ||
      "https://briefbot.app";
    const joinLink = `${appUrl}/join/${meeting.id}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">Voce foi convidado para uma reuniao</h2>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 8px 0; color: #1a1a2e;">${meeting.title}</h3>
          <p style="margin: 4px 0; color: #666;"><strong>Data:</strong> ${dateStr}</p>
          <p style="margin: 4px 0; color: #666;"><strong>Horario:</strong> ${timeStr}</p>
          ${meeting.description ? `<p style="margin: 12px 0 0 0; color: #444;">${meeting.description}</p>` : ""}
        </div>
        <a href="${joinLink}" style="display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Entrar na Reuniao
        </a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
          Ou copie este link: ${joinLink}
        </p>
      </div>
    `;

    let sent = 0;
    for (const email of attendees) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${senderName} <${senderEmail}>`,
            to: [email],
            subject: `Convite: ${meeting.title}`,
            html,
          }),
        });
        if (res.ok) sent++;
        else console.error(`Failed to send to ${email}:`, await res.text());
      } catch (err) {
        console.error(`Error sending to ${email}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent }),
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
