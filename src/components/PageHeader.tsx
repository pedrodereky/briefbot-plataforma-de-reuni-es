import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabeçalho de página: título, um resumo em monoespaçada e as ações.
 *
 * Ocupa a largura toda e fecha com uma linha, como nas telas aprovadas. O
 * antigo TopBar (só avatar e "Sair") saiu: identidade e logout desceram para o
 * rodapé do menu lateral, e a faixa do topo passou a ser do conteúdo — que é
 * onde o usuário procura o botão da ação principal.
 */
export function PageHeader({
  titulo,
  resumo,
  acoes,
  className,
  children,
}: {
  titulo: ReactNode;
  /** Linha curta de contexto: data, contagem, período. Vai em monoespaçada. */
  resumo?: ReactNode;
  acoes?: ReactNode;
  className?: string;
  /** Trilha de navegação ou qualquer coisa acima do título. */
  children?: ReactNode;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-border px-6 py-5 lg:px-7',
        className,
      )}
    >
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-foreground">
            {titulo}
          </h1>
          {resumo && (
            <span className="tabular font-mono text-xs text-muted-foreground">{resumo}</span>
          )}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}

/** Corpo da página, com o respiro que o cabeçalho não tem. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-6 py-6 lg:px-7', className)}>{children}</div>;
}
