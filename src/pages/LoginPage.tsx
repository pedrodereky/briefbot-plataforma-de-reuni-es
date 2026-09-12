import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Bot, Loader2, Mic, Video, Users, MessageSquare, Brain, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

function FloatingIcon({ icon: Icon, className }: { icon: React.ElementType; className: string }) {
  return (
    <div className={`absolute opacity-[0.07] text-primary ${className}`}>
      <Icon className="w-full h-full" strokeWidth={1.2} />
    </div>
  );
}

export default function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
    if (!email.trim() || !password.trim()) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          toast({ title: 'Erro ao entrar', description: error, variant: 'destructive' });
        }
      } else {
        const { error } = await signUp(email.trim(), password, name.trim() || undefined);
        if (error) {
          toast({ title: 'Erro ao criar conta', description: error, variant: 'destructive' });
        } else {
          toast({ title: 'Conta criada!', description: 'Verifique seu email para confirmar, ou entre diretamente.' });
          setMode('login');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/[0.06] blur-3xl animate-[drift-1_18s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-info/[0.06] blur-3xl animate-[drift-2_22s_ease-in-out_infinite]" />
        <div className="absolute top-[40%] left-[60%] w-[350px] h-[350px] rounded-full bg-success/[0.05] blur-3xl animate-[drift-3_15s_ease-in-out_infinite]" />
      </div>

      {/* Floating themed icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <FloatingIcon icon={Mic} className="w-16 h-16 top-[8%] left-[8%] animate-[float-1_12s_ease-in-out_infinite]" />
        <FloatingIcon icon={Video} className="w-20 h-20 top-[12%] right-[12%] animate-[float-2_14s_ease-in-out_infinite]" />
        <FloatingIcon icon={Users} className="w-14 h-14 bottom-[18%] left-[15%] animate-[float-3_10s_ease-in-out_infinite]" />
        <FloatingIcon icon={MessageSquare} className="w-12 h-12 top-[35%] left-[5%] animate-[float-2_16s_ease-in-out_infinite]" />
        <FloatingIcon icon={Brain} className="w-18 h-18 bottom-[12%] right-[8%] animate-[float-1_13s_ease-in-out_infinite]" />
        <FloatingIcon icon={Calendar} className="w-14 h-14 top-[60%] right-[5%] animate-[float-3_11s_ease-in-out_infinite]" />
        <FloatingIcon icon={Bot} className="w-10 h-10 bottom-[35%] left-[50%] animate-[float-2_15s_ease-in-out_infinite]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm space-y-6">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-elevated">
            <Bot className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">BriefBot</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        <Card className="shadow-elevated backdrop-blur-sm bg-card/90">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="h-11"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="você@empresa.com"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold" size="lg" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm">
              {mode === 'login' ? (
                <p className="text-muted-foreground">
                  Não tem conta?{' '}
                  <button onClick={() => setMode('register')} className="font-medium text-primary hover:underline">
                    Criar conta
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Ja tem conta?{' '}
                  <button onClick={() => setMode('login')} className="font-medium text-primary hover:underline">
                    Entrar
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
