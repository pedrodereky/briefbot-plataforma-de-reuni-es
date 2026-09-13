/**
 * Imports por URL das edge functions, para o TypeScript do frontend.
 *
 * `src/test/shared-chaves.test.ts` importa
 * `supabase/functions/_shared/chaves.ts`, que resolve o supabase-js por URL do
 * esm.sh — especificador que só o Deno sabe carregar. Sem esta declaração o
 * `tsc` da aplicação para em TS2307.
 *
 * O tipo abaixo NÃO é o SupabaseClient real: é só o contrato que `_shared/`
 * usa. Em produção quem resolve é o Deno, com os tipos do próprio esm.sh.
 *
 * Arquivo separado de `deno-globals.d.ts` de propósito: aquele tem `export {}`
 * e vira módulo, e dentro de um módulo `declare module "url"` significaria
 * AUMENTAR um módulo existente, não declarar um novo.
 */
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export interface SupabaseClient {
    rpc(
      nome: string,
      parametros?: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { code?: string } | null }>;
    from(tabela: string): {
      select(colunas: string): {
        eq(coluna: string, valor: unknown): {
          maybeSingle(): Promise<{ data: unknown; error: { code?: string } | null }>;
        };
      };
    };
  }
}
