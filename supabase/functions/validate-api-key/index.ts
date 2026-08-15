import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SERVICES = new Set([
  "livekit",
  "deepgram",
  "resend",
]);

async function readSecret(admin: any, userId: string, service: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_user_secret", {
    _user_id: userId,
    _service: service,
  });
  if (error) {
    console.error("get_user_secret failed", { service, code: error.code });
    return null;
  }
  return (data as string | null) ?? null;
}

async function setStatus(admin: any, userId: string, service: string, status: string) {
  await admin.rpc("set_secret_validation", {
    _user_id: userId,
    _service: service,
    _status: status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = String(body?.service_name ?? "").trim();
    if (!ALLOWED_SERVICES.has(service)) {
      return new Response(JSON.stringify({ error: "Invalid service_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let status: "valid" | "invalid" | "error" = "error";

    try {
      if (service === "livekit") {
        const apiKey = await readSecret(admin, userId, "livekit_api_key");
        const apiSecret = await readSecret(admin, userId, "livekit_api_secret");
        const url = await readSecret(admin, userId, "livekit_url");
        if (!apiKey || !apiSecret || !url) {
          status = "invalid";
        } else {
          const host = url.replace("wss://", "https://").replace("ws://", "http://");
          const client = new RoomServiceClient(host, apiKey, apiSecret);
          await client.listRooms();
          status = "valid";
        }
        await setStatus(admin, userId, "livekit_api_key", status);
        await setStatus(admin, userId, "livekit_api_secret", status);
        await setStatus(admin, userId, "livekit_url", status);
      } else if (service === "deepgram") {
        const key = await readSecret(admin, userId, "deepgram_api_key");
        if (!key) {
          status = "invalid";
        } else {
          const res = await fetch("https://api.deepgram.com/v1/projects", {
            headers: { Authorization: `Token ${key}` },
          });
          status = res.ok ? "valid" : "invalid";
        }
        await setStatus(admin, userId, "deepgram_api_key", status);
      } else if (service === "resend") {
        const key = await readSecret(admin, userId, "resend_api_key");
        if (!key) {
          status = "invalid";
        } else {
          const res = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${key}` },
          });
          status = res.ok ? "valid" : "invalid";
        }
        await setStatus(admin, userId, "resend_api_key", status);
      }
    } catch (err) {
      console.error("validation failed", { service });
      status = "error";
    }

    return new Response(JSON.stringify({ status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("validate-api-key unexpected error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});