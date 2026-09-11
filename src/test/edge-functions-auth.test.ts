import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda de autorização.
 *
 * Antes da Fase 1, dez edge functions recebiam `meeting_id` no corpo e agiam
 * com a service key sem verificar quem chamou — bastava conhecer o UUID de uma
 * reunião para encerrá-la, gravar na conta LiveKit alheia ou disparar e-mail
 * pelo domínio de outro usuário. Este teste impede que uma função volte a ser
 * escrita assim.
 */
const root = resolve(__dirname, "../..");
const functionsDir = resolve(root, "supabase/functions");

/** Mecanismos aceitos como prova de autorização. */
const GUARDAS = [
  "requireMeetingOwner",
  "requireMeetingAccess",
  "requireUser",
  "requireCron",
  "getAuthenticatedUser",
  "getClaims",
];

/**
 * Única exceção: o webhook do LiveKit não tem chamador autenticável — ele
 * prova identidade pela assinatura HMAC do corpo, verificada por
 * WebhookReceiver.receive(). Exigir uma das guardas acima aqui seria errado.
 */
const VERIFICA_ASSINATURA = new Set(["livekit-webhook"]);

function listarFunctions(): string[] {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
}

function lerFonte(nome: string): string {
  return readFileSync(resolve(functionsDir, nome, "index.ts"), "utf8");
}

describe("autorização das edge functions", () => {
  const functions = listarFunctions();

  it("encontra as edge functions no disco", () => {
    expect(functions.length).toBeGreaterThan(0);
  });

  it.each(listarFunctions())("%s verifica quem está chamando", (nome) => {
    const fonte = lerFonte(nome);

    if (VERIFICA_ASSINATURA.has(nome)) {
      expect(fonte).toContain("receiver.receive");
      return;
    }

    const encontradas = GUARDAS.filter((guarda) => fonte.includes(guarda));
    expect(
      encontradas,
      `${nome} não usa nenhuma guarda de autorização (${GUARDAS.join(", ")})`,
    ).not.toHaveLength(0);
  });

  it.each(listarFunctions())("%s não fixa Access-Control-Allow-Origin em *", (nome) => {
    const fonte = lerFonte(nome);
    // A origem permitida passou a ser decidida em _shared/http.ts a partir da
    // variável ALLOWED_ORIGINS, e não mais fixada em cada função.
    expect(fonte).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it.each(listarFunctions())("%s usa os helpers de CORS compartilhados", (nome) => {
    expect(lerFonte(nome)).toContain("../_shared/http.ts");
  });
});

describe("funções que agem sobre uma reunião", () => {
  /**
   * Estas recebem `meeting_id` (ou o resolvem) e operam com a service key.
   * Para elas, autenticar não basta: é preciso conferir que o chamador é o
   * dono da reunião — senão o IDOR continua aberto entre usuários logados.
   */
  const EXIGEM_DONO = [
    "end-meeting",
    "manage-recording",
    "generate-briefing",
    "generate-summary",
    "generate-insights",
    "detect-action-items",
    "send-invite",
    "send-slack",
  ];

  it.each(EXIGEM_DONO)("%s exige o dono da reunião", (nome) => {
    expect(lerFonte(nome)).toContain("requireMeetingOwner");
  });

  it("livekit-token e deepgram-token aceitam convidado só com join_token", () => {
    expect(lerFonte("deepgram-token")).toContain("requireMeetingAccess");
    expect(lerFonte("livekit-token")).toContain("verifyJoinToken");
  });

  it("deepgram-token não devolve mais a chave permanente do dono", () => {
    const fonte = lerFonte("deepgram-token");
    // A chave mestra só pode ser usada para CRIAR uma chave efêmera.
    expect(fonte).toContain("time_to_live_in_seconds");
    expect(fonte).not.toContain("JSON.stringify({ key: deepgramApiKey })");
  });

  it("livekit-token higieniza o nome do convidado", () => {
    expect(lerFonte("livekit-token")).toContain("sanitizeGuestName");
  });
});
