import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { capturarErro, requestId } from '@/lib/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

/**
 * Rede de segurança da interface.
 *
 * Sem isto (auditoria P2 item 21), qualquer exceção durante a renderização
 * derrubava a árvore inteira e o usuário ficava com uma tela branca, sem
 * mensagem e sem nada que pudesse relatar. Agora ele vê o que aconteceu e um
 * código que liga a tela dele ao log das edge functions.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    capturarErro(erro, { componentStack: info.componentStack });
  }

  private recarregar = () => {
    window.location.reload();
  };

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Algo deu errado nesta tela</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O erro foi registrado. Se precisar falar com o suporte, informe o código abaixo.
        </p>
        <code className="rounded bg-muted px-2 py-1 text-xs">{requestId}</code>

        {import.meta.env.DEV && (
          <pre className="max-w-xl overflow-auto rounded bg-muted p-3 text-left text-xs">
            {erro.message}
          </pre>
        )}

        <Button onClick={this.recarregar} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </Button>
      </div>
    );
  }
}
