import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { meeting_id, guest_name } = body;

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
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get LiveKit credentials from Vault via SECURITY DEFINER RPC
    const [keyRes, secretRes, urlRes] = await Promise.all([
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_key" }),
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_api_secret" }),
      supabase.rpc("get_user_secret", { _user_id: meeting.user_id, _service: "livekit_url" }),
    ]);
    const livekitApiKey = (keyRes.data as string | null) || Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = (secretRes.data as string | null) || Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = (urlRes.data as string | null) || Deno.env.get("LIVEKIT_URL");

    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return new Response(JSON.stringify({ error: "LiveKit not configured. Add your keys in Settings or Onboarding." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate room name if not set
    const roomName = meeting.livekit_room_name || `briefbot-${meeting_id}`;
    if (!meeting.livekit_room_name) {
      await supabase
        .from("meetings")
        .update({ livekit_room_name: roomName })
        .eq("id", meeting_id);
    }

    let identity: string;
    let participantName: string;
    let isHost = false;

    // Check if authenticated user
    const authHeader = req.headers.get("authorization");
    if (authHeader && !guest_name) {
      // Authenticated mode
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      identity = user.id;
      participantName = user.email || user.id;
      isHost = meeting.user_id === user.id;
    } else if (guest_name) {
      // Guest mode
      identity = `guest-${crypto.randomUUID()}`;
      participantName = guest_name;
    } else {
      return new Response(JSON.stringify({ error: "Provide auth token or guest_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create LiveKit access token
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: participantName,
      ttl: "2h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      ...(isHost ? { roomAdmin: true } : {}),
    });

    const jwt = await at.toJwt();

    return new Response(
      JSON.stringify({
        token: jwt,
        room_name: roomName,
        livekit_url: livekitUrl,
        identity,
        participant_name: participantName,
        is_host: isHost,
      }),
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
