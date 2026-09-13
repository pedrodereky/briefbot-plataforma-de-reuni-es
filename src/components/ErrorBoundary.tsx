import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { capturarErro, requestId } from '@/lib/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
  copiado: boolean;
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
  state: State = { erro: null, copiado: false };

  static getDerivedStateFromError(erro: Error): State {
    return { erro, copiado: false };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    capturarErro(erro, { componentStack: info.componentStack });
  }

  private recarregar = () => {
    window.location.reload();
  };

  /** Um bloco só, com tudo que o suporte precisa para localizar a falha. */
  private copiar = async () => {
    const { erro } = this.state;
    const texto = [
      `código: ${requestId}`,
      `rota: ${window.location.pathname}`,
      `quando: ${new Date().toISOString()}`,
      `erro: ${erro?.message ?? '—'}`,
      erro?.stack ? `\n${erro.stack}` : '',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.setState({ copiado: true });
    } catch {
      // Área de transferência bloqueada: o texto continua na tela para
      // seleção manual, que é o motivo de a mensagem estar visível.
    }
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

        {/* A mensagem aparece também em produção, de propósito. Antes ela só
            saía em DEV, e quando a tela caiu para valer restou um código de
            correlação e nenhuma pista — ninguém tinha como dizer o que
            aconteceu sem abrir o console. É a aplicação do próprio usuário,
            não um serviço multi-inquilino: esconder a mensagem dele não
            protege ninguém e custa o diagnóstico. */}
        <pre className="max-w-xl overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
          {erro.message}
        </pre>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={this.recarregar} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </Button>
          <Button variant="outline" onClick={this.copiar} className="gap-1.5">
            <Copy className="h-4 w-4" />
            {this.state.copiado ? 'Copiado' : 'Copiar detalhes'}
          </Button>
        </div>
      </div>
    );
  }
}
