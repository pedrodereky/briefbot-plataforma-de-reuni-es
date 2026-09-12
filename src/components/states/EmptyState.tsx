import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Vazio de primeiro uso.
 *
 * Não é erro nem falta de dado: é uma conta nova. Por isso não diz "nenhum
 * resultado encontrado" — diz o que dá para fazer agora, com os caminhos
 * reais, e o que a ferramenta vai fazer com eles.
 */
export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  children,
  rodape,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: ReactNode;
  /** Os caminhos de saída: cartões de ação, botões. */
  children?: ReactNode;
  rodape?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="flex max-w-[460px] flex-col items-center gap-3">
        <Icone className="h-9 w-9 stroke-[1.3] text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">{titulo}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{descricao}</p>
      </div>
      {children}
      {rodape && <p className="text-xs text-faint">{rodape}</p>}
    </div>
  );
}

/** Um dos caminhos de saída do estado vazio. */
export function EmptyStateCard({
  icone: Icone,
  titulo,
  descricao,
  acao,
  destaque,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao: ReactNode;
  /** O caminho recomendado ganha a borda em teal. */
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex w-[268px] max-w-full flex-col gap-2.5 rounded-lg border bg-card p-4 text-left',
        destaque ? 'border-primary/40' : 'border-border',
      )}
    >
      <Icone
        className={cn('h-[17px] w-[17px]', destaque ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-foreground">{titulo}</span>
      <p className="text-xs leading-relaxed text-muted-foreground">{descricao}</p>
      <div className="mt-1">{acao}</div>
    </div>
  );
}
