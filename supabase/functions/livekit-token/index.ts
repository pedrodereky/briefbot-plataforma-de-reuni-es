import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2";
import { handlePreflight, jsonResponse, errorResponse } from "../_shared/http.ts";
import { getAuthenticatedUser, verifyJoinToken, sanitizeGuestName } from "../_shared/auth.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const { meeting_id, guest_name, join_token } = body;

    if (!meeting_id) {
      return errorResponse(req, "meeting_id is required", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Autorização ───────────────────────────────────────────────────────────
    // Antes: bastava mandar meeting_id + guest_name e qualquer pessoa com o
    // UUID entrava em qualquer sala, inclusive já encerrada (auditoria P0-3).
    // Agora são dois caminhos, e nenhum deles dispensa prova de acesso:
    //   dono autenticado, ou portador do join_token válido e não expirado.
    const usuario = await getAuthenticatedUser(req);
    const userId = usuario?.id ?? null;
    const convite = await verifyJoinToken(supabase, meeting_id, join_token);

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .maybeSingle();

    if (meetingErr || !meeting) {
      return errorResponse(req, "Meeting not found", 404);
    }

    const ehDono = userId !== null && userId === meeting.user_id;

    if (!ehDono && !convite) {
      // Não revela se o id existe para quem não provou nada.
      return errorResponse(req, userId ? "Forbidden" : "Unauthorized", userId ? 403 : 401);
    }

    // Link de convite não ressuscita reunião encerrada. O dono ainda entra,
    // para revisar a sala.
    if (!ehDono && meeting.meeting_status === "ended") {
      return errorResponse(req, "Meeting has ended", 410);
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
      return errorResponse(
        req,
        "LiveKit not configured. Add your keys in Settings or Onboarding.",
        500,
      );
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
    const isHost = ehDono;

    if (ehDono) {
      identity = usuario!.id;
      participantName = usuario!.email || usuario!.id;
    } else {
      // Convidado: o nome é livre, então é higienizado antes de virar
      // identidade no LiveKit e aparecer na transcrição.
      const nomeLimpo = sanitizeGuestName(guest_name);
      if (!nomeLimpo) {
        return errorResponse(req, "guest_name is required", 400);
      }
      identity = `guest-${crypto.randomUUID()}`;
      participantName = nomeLimpo;
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

    return jsonResponse(req, {
      token: jwt,
      room_name: roomName,
      livekit_url: livekitUrl,
      identity,
      participant_name: participantName,
      is_host: isHost,
      meeting_title: meeting.title,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return errorResponse(req, "Internal server error", 500);
  }
});
