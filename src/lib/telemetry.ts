/**
 * Telemetria e correlação de erros.
 *
 * Antes não havia nada (auditoria P2 item 21): sem Error Boundary, sem
 * relatório de erro, e `console.error` solto nas edge functions sem nenhum
 * identificador em comum. Diagnosticar uma reunião que deu errado em produção
 * era impossível — não dava para ligar o que o usuário viu ao que a função
 * registrou.
 *
 * Aqui ficam as duas peças que resolvem isso:
 *
 *   1. um id de sessão, enviado no header `x-request-id` de toda chamada a
 *      edge function, que as funções repetem nos seus logs;
 *   2. um ponto único de captura de erro, que envia ao Sentry quando há DSN
 *      configurada e cai para o console quando não há.
 *
 * O Sentry é carregado sob demanda: sem `VITE_SENTRY_DSN` o pacote nem entra
 * no bundle inicial.
 */

type Contexto = Record<string, unknown>;

interface SentryLike {
  init: (config: Record<string, unknown>) => void;
  captureException: (erro: unknown, contexto?: { extra?: Contexto }) => void;
  setUser: (usuario: { id: string } | null) => void;
}

let sentry: SentryLike | null = null;
let iniciando: Promise<void> | null = null;

/**
 * Identificador desta sessão de navegador.
 *
 * Um por aba, não um por requisição: o objetivo é conseguir agrupar tudo que
 * um usuário fez numa mesma sessão ao investigar um problema.
 */
export const requestId: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function dsn(): string | undefined {
  const valor = import.meta.env.VITE_SENTRY_DSN;
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Inicializa o Sentry uma única vez, e só se houver DSN. */
export function iniciarTelemetria(): Promise<void> {
  if (iniciando) return iniciando;

  const endereco = dsn();
  if (!endereco) {
    iniciando = Promise.resolve();
    return iniciando;
  }

  iniciando = import('@sentry/react')
    .then((modulo) => {
      const sdk = modulo as unknown as SentryLike;
      sdk.init({
        dsn: endereco,
        environment: import.meta.env.MODE,
        // Amostragem conservadora: erro é sempre enviado, traço quase nunca.
        tracesSampleRate: 0,
        initialScope: { tags: { request_id: requestId } },
      });
      sentry = sdk;
    })
    .catch((err) => {
      console.warn('Telemetria indisponivel', err);
    });

  return iniciando;
}

/** Associa os erros seguintes a um usuário. Chamar no login e no logout. */
export function identificarUsuario(userId: string | null): void {
  sentry?.setUser(userId ? { id: userId } : null);
}

/**
 * Ponto único de captura.
 *
 * Sempre registra no console — é onde o desenvolvedor olha — e adicionalmente
 * envia ao Sentry quando ele está ativo.
 */
export function capturarErro(erro: unknown, contexto: Contexto = {}): void {
  const completo = { ...contexto, request_id: requestId };
  console.error('[briefbot]', erro, completo);
  sentry?.captureException(erro, { extra: completo });
}
