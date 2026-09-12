import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * Erro de ação.
 *
 * A frase que mais importa aqui é a `preservado`: quando a IA falha depois de
 * uma reunião de uma hora e meia, a primeira coisa que passa pela cabeça de
 * quem vê a tela é "perdi a reunião". Dizer o que NÃO se perdeu transforma o
 * erro em espera.
 */
export function ErrorState({
  titulo,
  descricao,
  preservado,
  acaoPrimaria,
  acaoSecundaria,
  detalhes,
  suporte,
}: {
  titulo: string;
  descricao: ReactNode;
  /** O que continua salvo, apesar da falha. */
  preservado?: string;
  acaoPrimaria?: ReactNode;
  acaoSecundaria?: ReactNode;
  /** Linhas técnicas para copiar e mandar ao suporte. */
  detalhes?: string[];
  suporte?: ReactNode;
}) {
  const { toast } = useToast();

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText((detalhes ?? []).join('\n'));
      toast({ description: 'Detalhes copiados.' });
    } catch {
      // Área de transferência bloqueada (contexto inseguro, permissão negada):
      // o texto continua na tela para seleção manual.
      toast({ variant: 'destructive', description: 'Não foi possível copiar. Selecione o texto.' });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="flex max-w-[500px] flex-col items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-destructive bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        </span>
        <h2 className="text-[17.5px] font-semibold tracking-[-0.01em] text-foreground">{titulo}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {descricao}
          {preservado && (
            <>
              {' '}
              <strong className="font-medium text-foreground">Nada foi perdido:</strong>{' '}
              {preservado}
            </>
          )}
        </p>
      </div>

      {(acaoPrimaria || acaoSecundaria) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {acaoPrimaria}
          {acaoSecundaria}
        </div>
      )}

      {detalhes && detalhes.length > 0 && (
        <div className="flex w-full max-w-[520px] flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Detalhes técnicos
            </span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={copiar}>
              Copiar
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-muted-foreground">
            {detalhes.join('\n')}
          </pre>
        </div>
      )}

      {suporte && <p className="text-xs text-faint">{suporte}</p>}
    </div>
  );
}
