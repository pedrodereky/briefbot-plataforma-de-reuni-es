import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { MarcaBriefBot } from '@/components/MarcaBriefBot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export const SENHA_MINIMA = 6;

/**
 * Onde o link do e-mail de recuperação aterrissa.
 *
 * O supabase-js lê o token do endereço sozinho e abre uma sessão de
 * recuperação antes desta tela montar — por isso a rota é pública: passar pelo
 * ProtectedRoute jogaria o usuário no onboarding em vez de deixá-lo trocar a
 * senha.
 *
 * A sessão de recuperação é o que autoriza a troca. Sem ela (link expirado,
 * endereço colado sem o token) não há o que fazer aqui, e a tela diz isso em
 * vez de mostrar um formulário que vai falhar.
 */
export default function RedefinirSenhaPage() {
  const { session, loading, definirNovaSenha } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [pronto, navigate]);

  const curta = senha.length > 0 && senha.length < SENHA_MINIMA;
  const diferentes = confirmacao.length > 0 && senha !== confirmacao;
  const podeSalvar = senha.length >= SENHA_MINIMA && senha === confirmacao && !salvando;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const { error } = await definirNovaSenha(senha);
      if (error) {
        toast({ title: 'Não foi possível trocar a senha', description: error, variant: 'destructive' });
        return;
      }
      setPronto(true);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center gap-2.5 px-6 py-6 sm:px-12">
        <MarcaBriefBot className="h-[18px] w-[18px] text-primary" />
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">BriefBot</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full max-w-[400px] flex-col gap-7">
          {pronto ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-9 w-9 text-success" aria-hidden="true" />
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Senha alterada</h1>
              <p className="text-sm text-muted-foreground">Levando você para o painel…</p>
            </div>
          ) : !session ? (
            /* Sem sessão de recuperação o formulário não teria como funcionar. */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  Este link não vale mais
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Links de redefinição expiram, e cada um só serve uma vez. Peça um novo na tela de
                  entrada — leva alguns segundos.
                </p>
              </div>
              <Button onClick={() => navigate('/login')} className="h-11">
                Pedir um link novo
              </Button>
            </div>
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Nova senha</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Escolha uma senha com pelo menos {SENHA_MINIMA} caracteres.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="senha" className="text-xs text-foreground">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-11"
                />
                {curta && (
                  <span className="text-xs text-destructive">
                    Faltam {SENHA_MINIMA - senha.length} caracteres.
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmacao" className="text-xs text-foreground">Repita a senha</Label>
                <Input
                  id="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  className="h-11"
                />
                {diferentes && <span className="text-xs text-destructive">As duas não conferem.</span>}
              </div>

              <Button type="submit" className="h-11 font-semibold" disabled={!podeSalvar}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar senha
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
