/**
 * Link de convite da reunião.
 *
 * O id da reunião deixou de ser suficiente para entrar (auditoria P0 item 3):
 * o convite agora carrega um segredo com validade, conferido no servidor pela
 * RPC verify_join_token. Centralizar a montagem aqui evita que algum ponto da
 * UI volte a distribuir um link sem token — que simplesmente não funciona.
 */

export const PARAM_TOKEN = "t";

/** Monta o link completo. Retorna null quando a reunião ainda não tem token. */
export function buildJoinLink(
  meetingId: string,
  joinToken: string | null | undefined,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string | null {
  if (!meetingId || !joinToken) return null;
  return `${origin}/join/${meetingId}?${PARAM_TOKEN}=${encodeURIComponent(joinToken)}`;
}

/** Lê o token da query string da página de entrada. */
export function readJoinToken(search: string): string | null {
  const valor = new URLSearchParams(search).get(PARAM_TOKEN);
  return valor && valor.length > 0 ? valor : null;
}
