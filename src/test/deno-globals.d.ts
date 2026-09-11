/**
 * Declaração de `Deno` para o TypeScript do frontend.
 *
 * `src/test/shared-http.test.ts` importa `supabase/functions/_shared/http.ts`
 * para testar a política de CORS das edge functions. Isso arrasta um arquivo
 * escrito para o runtime do Deno para dentro do programa da aplicação, onde o
 * global `Deno` não existe.
 *
 * Fica sob `src/` de propósito: o Deno nunca lê esta pasta, então não há risco
 * de conflitar com os tipos nativos dele quando as functions são publicadas.
 */
declare global {
  const Deno: {
    env: {
      get(chave: string): string | undefined;
    };
  };
}

export {};
