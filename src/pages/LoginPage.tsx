import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { MarcaBriefBot } from '@/components/MarcaBriefBot';

function LinhaDoCopiloto({
  hora,
  titulo,
  detalhe,
  destaque,
}: {
  hora: string;
  titulo: string;
  detalhe: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex gap-3 bg-card px-4 py-3.5">
      <span className="tabular min-w-[38px] shrink-0 font-mono text-[11px] text-faint">{hora}</span>
      <div className="flex flex-col gap-1">
        <span className={destaque ? 'text-[13px] leading-snug text-primary' : 'text-[13px] leading-snug text-foreground'}>
          {titulo}
        </span>
        <span className="text-xs text-muted-foreground">{detalhe}</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { session, loading, signIn, signUp, pedirRedefinicaoDeSenha } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register' | 'recuperar'>('login');
  const [enviado, setEnviado] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (mode !== 'recuperar' && !password.trim()) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          toast({ title: 'Erro ao entrar', description: error, variant: 'destructive' });
        }
      } else if (mode === 'recuperar') {
        const { error } = await pedirRedefinicaoDeSenha(email.trim());
        if (error) {
          toast({ title: 'Não foi possível enviar', description: error, variant: 'destructive' });
        } else {
          // Confirmação sem revelar se o e-mail existe: dizer "não temos esse
          // e-mail" entrega quem é cliente a quem só está testando endereços.
          setEnviado(true);
        }
      } else {
        const { error } = await signUp(email.trim(), password, name.trim() || undefined);
        if (error) {
          toast({ title: 'Erro ao criar conta', description: error, variant: 'destructive' });
        } else {
          toast({
            title: 'Conta criada!',
            description: 'Verifique seu email para confirmar, ou entre diretamente.',
          });
          setMode('login');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const entrando = mode === 'login';
  const recuperando = mode === 'recuperar';

  const titulo = recuperando ? 'Recuperar senha' : entrando ? 'Entrar' : 'Criar conta';
  const subtitulo = recuperando
    ? 'Informe o e-mail da conta. Enviamos um link para você escolher uma senha nova.'
    : 'Suas reuniões, com briefing antes e ata depois.';

  return (
    /* Formulário à esquerda, prova à direita: quem entra já viu o que a
       ferramenta entrega antes de digitar a senha. No celular a prova desce
       para baixo do formulário, e some de vez nas telas mais baixas. */
    <div className="flex min-h-screen w-full flex-col bg-background lg:flex-row">
      <div className="flex w-full flex-col justify-between gap-10 border-border bg-card px-6 py-10 sm:px-12 lg:w-[560px] lg:shrink-0 lg:border-r lg:px-16 lg:py-11">
        <div className="flex items-center gap-2.5">
          <MarcaBriefBot className="h-[18px] w-[18px] text-primary" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">BriefBot</span>
        </div>

        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-[27px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {titulo}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{subtitulo}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-xs text-foreground">
                  Nome
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="h-11"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs text-foreground">
                E-mail de trabalho
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
                required
                className="h-11"
              />
            </div>

            {!recuperando && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password" className="text-xs text-foreground">
                  Senha
                </Label>
                {entrando && (
                  <button
                    type="button"
                    onClick={() => { setMode('recuperar'); setEnviado(false); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci a senha
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={entrando ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
                className="h-11"
              />
            </div>
            )}

            {enviado && recuperando && (
              <p className="rounded-md border border-primary/30 bg-accent px-3 py-2.5 text-xs leading-relaxed text-accent-foreground">
                Se existir uma conta com esse e-mail, o link já está a caminho. Confira a caixa de
                entrada e o spam.
              </p>
            )}

            <Button type="submit" className="mt-1 h-11 w-full font-semibold" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {recuperando ? 'Enviar link' : entrando ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            {recuperando ? 'Lembrou a senha? ' : entrando ? 'Não tem conta? ' : 'Já tem conta? '}
            <button
              type="button"
              onClick={() => { setMode(entrando ? 'register' : 'login'); setEnviado(false); }}
              className="font-medium text-primary hover:underline"
            >
              {recuperando ? 'Voltar para entrar' : entrando ? 'Criar uma agora' : 'Entrar'}
            </button>
          </p>
        </div>

        <p className="text-xs text-faint">
          Ao entrar você concorda com os termos e a política de privacidade.
        </p>
      </div>

      <div className="hidden flex-1 flex-col justify-center gap-6 px-16 py-12 lg:flex">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-primary">
            Copiloto
          </span>
        </div>

        <p className="max-w-[480px] text-[22px] font-medium leading-snug tracking-[-0.015em] text-foreground">
          A reunião termina e a ata já está escrita, com quem ficou responsável pelo quê.
        </p>

        <div className="max-w-[520px] divide-y divide-border overflow-hidden rounded-lg border border-border">
          <LinhaDoCopiloto
            hora="16:05"
            titulo="Reunião encerrada · Retrospectiva de agosto"
            detalhe="62 min transcritos"
          />
          <LinhaDoCopiloto
            destaque
            hora="16:07"
            titulo="Ata gerada · 3 decisões, 6 action items"
            detalhe="enviada a 7 participantes"
          />
          <LinhaDoCopiloto
            destaque
            hora="16:07"
            titulo="2 pendências continuam sem dono"
            detalhe="sinalizadas no topo da ata"
          />
        </div>

        <div className="mt-1 flex gap-8">
          <div className="flex flex-col gap-0.5">
            <span className="tabular font-mono text-[19px] font-medium text-foreground">8 min</span>
            <span className="text-xs text-muted-foreground">economizados por reunião</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="tabular font-mono text-[19px] font-medium text-foreground">pt-BR</span>
            <span className="text-xs text-muted-foreground">transcrição nativa</span>
          </div>
        </div>
      </div>
    </div>
  );
}
