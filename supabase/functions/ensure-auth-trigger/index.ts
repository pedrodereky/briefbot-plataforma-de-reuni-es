// Edge function: ensure-auth-trigger
// Verifies that the on_auth_user_created trigger exists on auth.users.
// If missing (typical after a Lovable remix), it reinstalls it via a
// SECURITY DEFINER RPC. Designed to fail gracefully — never throws to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          created: false,
          message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Check if trigger already exists
    const { data: existsData, error: checkError } = await supabase.rpc(
      "check_auth_trigger_exists",
    );

    if (checkError) {
      console.warn("[ensure-auth-trigger] check failed:", checkError.message);
      return new Response(
        JSON.stringify({
          ok: false,
          created: false,
          message:
            "Could not verify trigger. Run the SQL migration manually as 'postgres' role. Details: " +
            checkError.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (existsData === true) {
      return new Response(
        JSON.stringify({
          ok: true,
          created: false,
          message: "Trigger already exists.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // 2) Trigger missing → install it
    const { error: installError } = await supabase.rpc("install_auth_trigger");

    if (installError) {
      console.warn("[ensure-auth-trigger] install failed:", installError.message);
      return new Response(
        JSON.stringify({
          ok: false,
          created: false,
          message:
            "Trigger missing and auto-install failed. Run the SQL migration manually. Details: " +
            installError.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // 3) Verify install
    const { data: verifyData } = await supabase.rpc("check_auth_trigger_exists");

    return new Response(
      JSON.stringify({
        ok: verifyData === true,
        created: verifyData === true,
        message:
          verifyData === true
            ? "Trigger installed successfully."
            : "Install RPC ran but trigger still not detected.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ensure-auth-trigger] unexpected error:", message);
    return new Response(
      JSON.stringify({ ok: false, created: false, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
