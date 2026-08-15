import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SESSION_FLAG = "auth_trigger_checked";

/**
 * Runs once per browser session. Calls the `ensure-auth-trigger` edge
 * function to verify (and reinstall if needed) the auth.users trigger
 * that creates a corresponding row in public.user_settings.
 *
 * Designed for remixed projects where Lovable does not replicate triggers
 * on the `auth` schema. Non-blocking; failures only log + show a discreet toast.
 */
export function useEnsureAuthTrigger() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "ensure-auth-trigger",
        );

        if (cancelled) return;
        sessionStorage.setItem(SESSION_FLAG, "1");

        if (error) {
          console.warn("[Auth Setup] Trigger check failed:", error);
          toast.warning("Configuração de autenticação", {
            description:
              "Não foi possível validar o trigger de auth. Veja o README para o fix manual.",
          });
          return;
        }

        if (!data?.ok) {
          console.warn("[Auth Setup] Trigger check returned not-ok:", data);
          toast.warning("Configuração de autenticação", {
            description:
              data?.message ??
              "Trigger de auth ausente. Veja o README para o fix manual.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        sessionStorage.setItem(SESSION_FLAG, "1");
        console.warn("[Auth Setup]", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
