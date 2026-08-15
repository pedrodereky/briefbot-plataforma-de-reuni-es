import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch meeting
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, user_id, livekit_room_name, meeting_status")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Update status to ended
    await supabase
      .from("meetings")
      .update({ meeting_status: "ended" })
      .eq("id", meeting_id);

    console.log(`Meeting ${meeting_id} marked as ended`);

    // 2. Close LiveKit room (kick all participants)
    if (meeting.livekit_room_name) {
      try {
        const [keyRes, secretRes, urlRes] = await Promise.all([
          supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_key" }),
          supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_secret" }),
          supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_url" }),
        ]);
        const apiKey = (keyRes.data as string | null) || Deno.env.get("LIVEKIT_API_KEY");
        const apiSecret = (secretRes.data as string | null) || Deno.env.get("LIVEKIT_API_SECRET");
        const url = (urlRes.data as string | null) || Deno.env.get("LIVEKIT_URL");
        if (url && apiKey && apiSecret) {
          const roomService = new RoomServiceClient(url, apiKey, apiSecret);
          await roomService.deleteRoom(meeting.livekit_room_name);
          console.log(`LiveKit room ${meeting.livekit_room_name} deleted`);
        }
      } catch (err) {
        console.error("Failed to delete LiveKit room (non-blocking):", err);
      }
    }

    // 3. Fetch transcripts
    const { data: transcripts } = await supabase
      .from("meeting_transcripts")
      .select("participant_name, text")
      .eq("meeting_id", meeting_id)
      .eq("is_final", true)
      .order("timestamp", { ascending: true });

    const hasTranscripts = transcripts && transcripts.length > 0;

    if (hasTranscripts) {
      // 4. Generate summary (call internal function)
      try {
        const summaryUrl = `${supabaseUrl}/functions/v1/generate-summary`;
        const summaryRes = await fetch(summaryUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            meeting_id,
            use_live_transcript: true,
          }),
        });
        const summaryData = await summaryRes.json();
        console.log("Summary result:", JSON.stringify(summaryData));
      } catch (err) {
        console.error("Summary generation failed:", err);
      }

      // 5. Generate insights (call internal function)
      try {
        const insightsUrl = `${supabaseUrl}/functions/v1/generate-insights`;
        const insightsRes = await fetch(insightsUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ meeting_id }),
        });
        const insightsData = await insightsRes.json();
        console.log("Insights result:", JSON.stringify(insightsData));
      } catch (err) {
        console.error("Insights generation failed:", err);
      }
    } else {
      console.log("No transcripts found, skipping summary/insights");
    }

    return new Response(
      JSON.stringify({
        success: true,
        room_closed: !!meeting.livekit_room_name,
        summary_triggered: hasTranscripts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("end-meeting error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to end meeting" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
