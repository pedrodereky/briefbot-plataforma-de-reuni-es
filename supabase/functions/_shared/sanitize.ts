/**
 * Helpers puros, sem dependência de rede ou do runtime do Deno.
 *
 * Ficam separados de auth.ts de propósito: auth.ts importa de esm.sh, o que
 * impede o vitest de carregá-lo. Aqui a lógica sensível fica coberta por
 * teste automatizado rodando no CI.
 */

/** Comparação em tempo constante: evita descobrir a chave byte a byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Faixas de caracteres invisíveis/controle removidas do nome do convidado. */
const CARACTERES_INVISIVEIS = new RegExp(
  [
    "[\\u0000-\\u001F\\u007F-\\u009F]", // controles C0/C1
    "[\\u200B-\\u200F]", // zero-width e marcas de direção
    "[\\u2028-\\u202E]", // separadores de linha e overrides bidi
    "[\\uFEFF]", // BOM
  ].join("|"),
  "g",
);

/**
 * Higieniza o nome do convidado.
 *
 * O valor é renderizado na lista de participantes e na transcrição, e antes
 * ia cru do corpo da requisição para o token do LiveKit.
 */
export function sanitizeGuestName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const limpo = raw.replace(CARACTERES_INVISIVEIS, "").trim().slice(0, 60);
  return limpo.length > 0 ? limpo : null;
}
