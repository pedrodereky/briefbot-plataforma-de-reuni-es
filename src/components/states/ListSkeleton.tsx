import { cn } from '@/lib/utils';

/**
 * Esqueleto de lista.
 *
 * Tem a forma do conteúdo que vai chegar — mesma altura de linha, mesmas
 * colunas — para a tela não pular quando os dados entram. Cabeçalho e botões
 * ficam de fora de propósito: já são conhecidos antes da resposta, e virar
 * bloco cinza só piora.
 */
export function ListSkeleton({ linhas = 4, className }: { linhas?: number; className?: string }) {
  return (
    <div
      className={cn('divide-y divide-border overflow-hidden rounded-lg border border-border', className)}
      aria-hidden="true"
    >
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 bg-card px-4 py-3.5">
          <span className="h-3 w-10 animate-pulse rounded-sm bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <span
              className="h-3 animate-pulse rounded-sm bg-muted"
              style={{ width: `${58 - i * 6}%` }}
            />
            <span
              className="h-2.5 animate-pulse rounded-sm bg-muted"
              style={{ width: `${38 - i * 4}%` }}
            />
          </div>
          <span className="h-4 w-20 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}
