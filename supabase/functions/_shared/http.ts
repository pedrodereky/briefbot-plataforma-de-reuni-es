/**
 * CORS e helpers de resposta compartilhados pelas edge functions.
 *
 * Antes da Fase 1 cada função repetia `Access-Control-Allow-Origin: "*"`,
 * inclusive nas que recebem credencial. Aqui a origem passa a ser controlada
 * pela variável de ambiente ALLOWED_ORIGINS.
 */

/**
 * Lista de origens permitidas, separadas por vírgula.
 * Ex.: "https://app.briefbot.com,https://briefbot.lovable.app"
 *
 * Quando NÃO definida, o comportamento antigo (`*`) é mantido de propósito:
 * apertar CORS sem saber a origem de produção derrubaria o app inteiro. A
 * variável precisa ser configurada no deploy para o controle valer — até lá
 * cada requisição registra um aviso no log.
 */
function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

let avisouOrigemAberta = false;

export function corsHeaders(req: Request): Record<string, string> {
  const permitidas = allowedOrigins();
  const origem = req.headers.get("origin");

  let allowOrigin: string;
  if (permitidas.length === 0) {
    if (!avisouOrigemAberta) {
      console.warn("ALLOWED_ORIGINS não configurada — CORS liberado para qualquer origem");
      avisouOrigemAberta = true;
    }
    allowOrigin = "*";
  } else if (origem && permitidas.includes(origem)) {
    allowOrigin = origem;
  } else {
    // Origem desconhecida: devolve a primeira permitida, o que faz o navegador
    // bloquear a resposta no cliente.
    allowOrigin = permitidas[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Responde ao preflight quando for o caso; senão devolve null. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { headers: corsHeaders(req) });
}

export function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function errorResponse(req: Request, message: string, status: number): Response {
  return jsonResponse(req, { error: message }, status);
}
