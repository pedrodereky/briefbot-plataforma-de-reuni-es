import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * `_shared/http.ts` roda no Deno, mas não importa nada remoto — dá para
 * exercitá-lo aqui desde que `Deno.env` exista. É o módulo que decide a
 * política de CORS de TODAS as edge functions (auditoria P0 item 6), então
 * vale testar o comportamento em vez de confiar na leitura.
 */

const env = new Map<string, string>();

beforeEach(() => {
  env.clear();
  vi.resetModules();
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (chave: string) => env.get(chave) },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

async function carregar() {
  return await import("../../supabase/functions/_shared/http.ts");
}

function requisicao(origem?: string, headers: Record<string, string> = {}) {
  return new Request("https://exemplo/funcao", {
    method: "POST",
    headers: { ...(origem ? { origin: origem } : {}), ...headers },
  });
}

describe("corsHeaders", () => {
  it("sem ALLOWED_ORIGINS mantém `*` — comportamento antigo preservado", async () => {
    // Decisão deliberada: apertar CORS sem conhecer a origem de produção
    // derrubaria o app. A variável precisa ser configurada no deploy.
    const { corsHeaders } = await carregar();
    expect(corsHeaders(requisicao("https://qualquer.com"))["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("com ALLOWED_ORIGINS, devolve a origem quando ela é permitida", async () => {
    env.set("ALLOWED_ORIGINS", "https://app.briefbot.com,https://briefbot.lovable.app");
    const { corsHeaders } = await carregar();
    const headers = corsHeaders(requisicao("https://briefbot.lovable.app"));
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://briefbot.lovable.app");
  });

  it("origem não permitida não é ecoada de volta", async () => {
    env.set("ALLOWED_ORIGINS", "https://app.briefbot.com");
    const { corsHeaders } = await carregar();
    const headers = corsHeaders(requisicao("https://site-malicioso.com"));
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("https://site-malicioso.com");
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });

  it("requisição sem header origin não recebe curinga quando há lista", async () => {
    env.set("ALLOWED_ORIGINS", "https://app.briefbot.com");
    const { corsHeaders } = await carregar();
    expect(corsHeaders(requisicao())["Access-Control-Allow-Origin"]).toBe(
      "https://app.briefbot.com",
    );
  });

  it("ignora espaços e entradas vazias na lista", async () => {
    env.set("ALLOWED_ORIGINS", " https://app.briefbot.com , , https://outro.com ");
    const { corsHeaders } = await carregar();
    expect(corsHeaders(requisicao("https://outro.com"))["Access-Control-Allow-Origin"]).toBe(
      "https://outro.com",
    );
  });

  it("declara Vary: Origin, senão a resposta é cacheada para a origem errada", async () => {
    env.set("ALLOWED_ORIGINS", "https://app.briefbot.com");
    const { corsHeaders } = await carregar();
    expect(corsHeaders(requisicao("https://app.briefbot.com")).Vary).toBe("Origin");
  });

  it("aceita os headers que o app realmente envia", async () => {
    const { corsHeaders } = await carregar();
    const permitidos = corsHeaders(requisicao())["Access-Control-Allow-Headers"];
    for (const header of ["authorization", "apikey", "content-type", "x-cron-secret", "x-request-id"]) {
      expect(permitidos).toContain(header);
    }
  });
});

describe("requestId", () => {
  it("usa o id enviado pelo cliente", async () => {
    const { requestId } = await carregar();
    expect(requestId(requisicao(undefined, { "x-request-id": "abc-123" }))).toBe("abc-123");
  });

  it("gera um id quando o cliente não manda", async () => {
    const { requestId } = await carregar();
    const id = requestId(requisicao());
    expect(id).toMatch(/^srv-/);
    expect(id.length).toBeGreaterThan(10);
  });
});

describe("handlePreflight", () => {
  it("responde ao OPTIONS", async () => {
    const { handlePreflight } = await carregar();
    const resposta = handlePreflight(
      new Request("https://exemplo/funcao", { method: "OPTIONS" }),
    );
    expect(resposta).not.toBeNull();
    expect(resposta!.status).toBe(200);
  });

  it("deixa passar qualquer outro método", async () => {
    const { handlePreflight } = await carregar();
    expect(handlePreflight(requisicao())).toBeNull();
  });
});

describe("errorResponse", () => {
  it("devolve JSON com o status pedido e os headers de CORS", async () => {
    env.set("ALLOWED_ORIGINS", "https://app.briefbot.com");
    const { errorResponse } = await carregar();
    const resposta = errorResponse(requisicao("https://app.briefbot.com"), "Forbidden", 403);

    expect(resposta.status).toBe(403);
    expect(resposta.headers.get("Access-Control-Allow-Origin")).toBe("https://app.briefbot.com");
    await expect(resposta.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
