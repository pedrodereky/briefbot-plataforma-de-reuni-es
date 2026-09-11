import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EgressClient } from "npm:livekit-server-sdk@2";
import { corsHeaders, handlePreflight } from "../_shared/http.ts";
import { requireMeetingOwner } from "../_shared/auth.ts";


serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { meeting_id, action } = await req.json();

    if (!meeting_id || !action) {
      return new Response(JSON.stringify({ error: "meeting_id and action (start|stop) required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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


    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const [keyRes, secretRes, urlRes] = await Promise.all([
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_key" }),
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_secret" }),
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_url" }),
    ]);
    const apiKey = (keyRes.data as string | null) || Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = (secretRes.data as string | null) || Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = (urlRes.data as string | null) || Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const livekitHost = livekitUrl.replace("wss://", "https://");
    const roomName = meeting.livekit_room_name;

    if (!roomName) {
      return new Response(JSON.stringify({ error: "No LiveKit room for this meeting" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const egressClient = new EgressClient(livekitHost, apiKey, apiSecret);

    if (action === "start") {
      const fileName = `recordings/${meeting_id}-${Date.now()}.mp4`;

      // Use Room Composite Egress with direct file output
      // LiveKit Cloud stores the file and provides a download URL
      let egress;
      try {
        egress = await egressClient.startRoomCompositeEgress(
          roomName,
          { file: { fileType: 0, filepath: fileName } }, // 0 = MP4
        );
      } catch (err: any) {
        console.error("Egress start error:", err.message);

        // If egress fails (e.g. free plan), mark as attempted but continue
        // The meeting still works, just without recording
        return new Response(
          JSON.stringify({
            success: false,
            error: "Recording not available. LiveKit Egress requires a paid plan.",
            hint: "Upgrade your LiveKit plan at cloud.livekit.io to enable recording.",
          }),
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("meetings")
        .update({ recording_egress_id: egress.egressId })
        .eq("id", meeting_id);

      return new Response(
        JSON.stringify({ success: true, egress_id: egress.egressId, status: "recording" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );

    } else if (action === "stop") {
      const egressId = meeting.recording_egress_id;
      if (!egressId) {
        return new Response(JSON.stringify({ success: true, status: "no_active_recording" }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let recordingUrl: string | null = null;

      try {
        const info = await egressClient.stopEgress(egressId);

        // Extract recording URL from egress results
        if (info.fileResults && info.fileResults.length > 0) {
          recordingUrl = info.fileResults[0].location || info.fileResults[0].filename || null;
        }
      } catch (err: any) {
        console.error("Egress stop error:", err.message);
        // Egress may have already stopped or expired
      }

      // Also check Supabase Storage as fallback
      if (!recordingUrl) {
        try {
          const { data: files } = await supabase.storage
            .from("recordings")
            .list("", { search: meeting_id });
          if (files && files.length > 0) {
            const { data: urlData } = supabase.storage
              .from("recordings")
              .getPublicUrl(files[0].name);
            recordingUrl = urlData.publicUrl;
          }
        } catch {
          // Storage bucket may not exist
        }
      }

      // Save whatever URL we got
      await supabase
        .from("meetings")
        .update({
          recording_url: recordingUrl,
          recording_egress_id: null, // Clear egress ID
        })
        .eq("id", meeting_id);

      return new Response(
        JSON.stringify({ success: true, recording_url: recordingUrl, status: "stopped" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Recording error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
