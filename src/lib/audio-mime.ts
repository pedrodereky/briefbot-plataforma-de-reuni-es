/**
 * Escolha do formato de áudio para o MediaRecorder.
 *
 * O código antes fixava `audio/webm;codecs=opus` (auditoria P1 item 12). O
 * Safari — desktop e todo navegador no iOS — não suporta esse container: o
 * construtor do MediaRecorder lança, a transcrição nunca começa e o usuário
 * não recebe explicação nenhuma. Aqui o formato é negociado com o navegador,
 * em ordem de preferência, e a ausência de suporte vira uma mensagem clara.
 */

/** Ordem de preferência: melhor qualidade/compatibilidade com o Deepgram primeiro. */
export const FORMATOS_PREFERIDOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2', // Safari
  'audio/mp4',
] as const;

type SuporteMime = (tipo: string) => boolean;

function suportePadrao(): SuporteMime | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return (tipo: string) => MediaRecorder.isTypeSupported(tipo);
}

/**
 * Devolve o primeiro formato suportado, ou null se nenhum servir.
 *
 * `isSupported` existe para o teste injetar o suporte de um navegador
 * específico; em produção usa o do próprio MediaRecorder.
 */
export function escolherMimeType(isSupported: SuporteMime | null = suportePadrao()): string | null {
  if (!isSupported) return null;
  for (const formato of FORMATOS_PREFERIDOS) {
    if (isSupported(formato)) return formato;
  }
  return null;
}
