import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme, type Tema } from '@/contexts/ThemeProvider';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface OpcaoTema {
  valor: Tema;
  titulo: string;
  descricao: string;
}

const OPCOES: OpcaoTema[] = [
  { valor: 'sistema', titulo: 'Sistema', descricao: 'segue o aparelho · padrão' },
  { valor: 'claro', titulo: 'Claro', descricao: 'sempre claro' },
  { valor: 'escuro', titulo: 'Escuro', descricao: 'sempre escuro' },
];

/**
 * Miniatura do tema.
 *
 * As cores aqui são literais de propósito: o cartão precisa mostrar o tema
 * CLARO enquanto o app está no escuro, e vice-versa. Se usasse token, as três
 * miniaturas ficariam idênticas — todas no tema atual — e o seletor não
 * mostraria nada.
 */
function Miniatura({ variante }: { variante: Tema }) {
  const claro = (
    <div className="flex w-full flex-col gap-[5px] bg-[#f6f8fa] p-[9px]">
      <span className="h-[6px] w-[62%] rounded-sm bg-[#12161c]" />
      <span className="h-[5px] w-[80%] rounded-sm bg-[#c3cbd6]" />
      <span className="h-[5px] w-[45%] rounded-sm bg-[#0d7f91]" />
    </div>
  );
  const escuro = (
    <div className="flex w-full flex-col gap-[5px] bg-[#0e1116] p-[9px]">
      <span className="h-[6px] w-[62%] rounded-sm bg-[#e6e9ee]" />
      <span className="h-[5px] w-[80%] rounded-sm bg-[#3a4350]" />
      <span className="h-[5px] w-[45%] rounded-sm bg-[#4fc3d4]" />
    </div>
  );

  return (
    <div className="flex h-24 overflow-hidden rounded-md border border-border">
      {variante === 'escuro' ? null : claro}
      {variante === 'claro' ? null : escuro}
    </div>
  );
}

export function AppearanceSection() {
  const { tema, definirTema } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tema</CardTitle>
        <CardDescription>
          Por padrão o BriefBot acompanha o sistema: se o seu computador ou celular estiver no
          modo escuro, o app entra escuro. Escolher Claro ou Escuro fixa o tema, independente do
          sistema.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div
          role="radiogroup"
          aria-label="Tema da interface"
          className="grid gap-3 sm:grid-cols-3"
        >
          {OPCOES.map((opcao) => {
            const selecionado = tema === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                role="radio"
                aria-checked={selecionado}
                onClick={() => definirTema(opcao.valor)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selecionado
                    ? 'border-primary ring-[3px] ring-primary/20'
                    : 'border-border hover:border-input',
                )}
              >
                <Miniatura variante={opcao.valor} />
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{opcao.titulo}</span>
                    <span className="text-xs text-muted-foreground">{opcao.descricao}</span>
                  </div>
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      selecionado ? 'border-primary' : 'border-input',
                    )}
                  >
                    {selecionado && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            A sala de reunião ao vivo é sempre escura, nos três casos — vídeo pede fundo escuro
            ao redor.
          </p>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="reduzir-animacoes" className="text-sm font-medium">
              Reduzir animações
            </Label>
            <p className="text-sm text-muted-foreground">
              Já ativado automaticamente se o sistema pedir menos movimento.
            </p>
          </div>
          <Switch id="reduzir-animacoes" disabled aria-describedby="reduzir-animacoes-nota" />
        </div>
        <p id="reduzir-animacoes-nota" className="sr-only">
          Controlado pela preferência de movimento do sistema.
        </p>
      </CardContent>
    </Card>
  );
}
