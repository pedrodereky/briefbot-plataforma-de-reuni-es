/**
 * Extração de mensagem de erro sem `any`.
 *
 * O padrão `catch (err: any) { ...err.message }` aparecia 20 vezes no projeto
 * e era a maior fonte de erros de lint (auditoria P2 item 18). Além do lint,
 * ele mente: nem todo valor lançado é `Error`, e `err.message` num objeto
 * qualquer devolve `undefined`, que a interface exibia como "undefined" no
 * corpo do toast.
 */

/** Devolve a mensagem do erro, ou o texto de reserva quando não houver uma. */
export function mensagemDeErro(err: unknown, reserva = 'Erro inesperado'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;

  // Erros do supabase-js chegam como objetos simples com `message`.
  if (err && typeof err === 'object' && 'message' in err) {
    const { message } = err as { message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }

  return reserva;
}
