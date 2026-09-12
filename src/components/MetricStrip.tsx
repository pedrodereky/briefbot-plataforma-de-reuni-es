import { cn } from '@/lib/utils';

export interface Metrica {
  label: string;
  valor: number | string;
  /** Destaca em coral: usado no que exige ação, como itens vencendo. */
  alerta?: boolean;
}

/**
 * Faixa de números no topo da página.
 *
 * Sem cartões e sem ícones: quatro células separadas por uma linha de 1px. Os
 * ícones decorativos que havia aqui (calendário, envelope) não diziam nada que
 * o rótulo já não dissesse, e roubavam o espaço do número — que é a única
 * coisa que alguém lê nessa faixa.
 */
export function MetricStrip({ metricas, carregando }: { metricas: Metrica[]; carregando?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      {metricas.map((m) => (
        <div key={m.label} className="flex flex-col gap-1 bg-background px-6 py-4 lg:px-7">
          <span className="text-[11.5px] uppercase tracking-[0.02em] text-muted-foreground">
            {m.label}
          </span>
          {carregando ? (
            <span className="h-[26px] w-10 animate-pulse rounded-sm bg-muted" />
          ) : (
            <span
              className={cn(
                'tabular font-mono text-[26px] font-medium leading-tight',
                m.alerta && Number(m.valor) > 0 ? 'text-destructive' : 'text-foreground',
              )}
            >
              {m.valor}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
