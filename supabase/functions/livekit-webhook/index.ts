import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WebhookReceiver } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);

    const body = await req.text();
    const authHeader = req.headers.get("authorization") || "";

    // Verify webhook signature
    const event = await receiver.receive(body, authHeader);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const roomName = event.room?.name;

    if (!roomName) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find meeting by room name
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, user_id, meeting_status")
      .eq("livekit_room_name", roomName)
      .single();

    if (!meeting) {
      console.log(`No meeting found for room: ${roomName}`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        const currentStatus = meeting.meeting_status || 'live';
        if (currentStatus !== 'ended') {
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

      case "participant_joined": {
        console.log(`Participant joined room ${roomName}: ${event.participant?.identity}`);
        break;
      }

      case "participant_left": {
        console.log(`Participant left room ${roomName}: ${event.participant?.identity}`);
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
