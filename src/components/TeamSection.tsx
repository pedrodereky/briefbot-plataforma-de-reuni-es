import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/errors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, UserPlus, Copy, Check } from 'lucide-react';

type Papel = 'owner' | 'admin' | 'member';

interface Membro {
  user_id: string;
  papel: Papel;
  email: string | null;
  nome: string | null;
  criado_em: string;
}

interface RespostaEquipe {
  organizacao: { id: string; nome: string } | null;
  meu_papel: Papel;
  membros: Membro[];
}

const ROTULO: Record<Papel, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  member: 'Membro',
};

/**
 * Tudo aqui passa pela edge function `manage-team`, nunca pela tabela.
 *
 * `organization_members` não concede INSERT nem DELETE a `authenticated`: a
 * autorização de quem pode convidar, promover e remover mora no servidor, num
 * lugar só. Criar usuário, então, é obrigatoriamente lá — exige a chave de
 * serviço, que não pode chegar ao navegador.
 */
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-team', { body: corpo });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function TeamSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<'admin' | 'member'>('member');
  const [criando, setCriando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['equipe'],
    queryFn: () => chamar<RespostaEquipe>({ acao: 'listar' }),
    enabled: !!user,
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ['equipe'] });
  const administra = data?.meu_papel === 'owner' || data?.meu_papel === 'admin';

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    try {
      const r = await chamar<{ senha_provisoria: string }>({
        acao: 'criar', email: email.trim(), nome: nome.trim(), papel,
      });
      // A senha aparece UMA vez. Não fica gravada em lugar nenhum: quem
      // perder, entra por "Esqueci a senha".
      setSenhaGerada({ email: email.trim(), senha: r.senha_provisoria });
      setEmail('');
      setNome('');
      setPapel('member');
      recarregar();
    } catch (err) {
      toast({ title: 'Não foi possível criar', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setCriando(false);
    }
  };

  const trocarPapel = async (userId: string, novo: 'admin' | 'member') => {
    try {
      await chamar({ acao: 'papel', user_id: userId, papel: novo });
      recarregar();
    } catch (err) {
      toast({ title: 'Não foi possível alterar', description: mensagemDeErro(err), variant: 'destructive' });
    }
  };

  const remover = async (userId: string) => {
    try {
      await chamar({ acao: 'remover', user_id: userId });
      toast({ title: 'Pessoa removida da equipe' });
      recarregar();
    } catch (err) {
      toast({ title: 'Não foi possível remover', description: mensagemDeErro(err), variant: 'destructive' });
    }
  };

  const copiarSenha = async () => {
    if (!senhaGerada) return;
    try {
      await navigator.clipboard.writeText(
        `E-mail: ${senhaGerada.email}\nSenha provisória: ${senhaGerada.senha}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast({ variant: 'destructive', description: 'Não foi possível copiar. Selecione o texto.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipe</CardTitle>
        <CardDescription>
          Quem está aqui compartilha as reuniões, atas, action items e contatos da organização.
          Configurações pessoais — tema, prompts — continuam de cada um.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a equipe…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{mensagemDeErro(error)}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Organização
              </span>
              <span className="text-sm font-medium text-foreground">
                {data?.organizacao?.nome ?? '—'}
              </span>
            </div>

            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {data?.membros.map((m) => {
                const souEu = m.user_id === user?.id;
                return (
                  <div key={m.user_id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {m.nome ?? m.email ?? 'Sem nome'}
                        {souEu && <span className="ml-2 text-xs text-muted-foreground">você</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                    </div>

                    {m.papel === 'owner' || !administra || souEu ? (
                      <Badge variant="outline" className="text-xs">{ROTULO[m.papel]}</Badge>
                    ) : (
                      <Select
                        value={m.papel}
                        onValueChange={(v) => trocarPapel(m.user_id, v as 'admin' | 'member')}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Membro</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {administra && !souEu && m.papel !== 'owner' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            Remover
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover da equipe?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {m.email} perde o acesso às reuniões e atas da organização. A conta
                              continua existindo, e o que essa pessoa criou permanece aqui.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remover(m.user_id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>

            {administra && (
              <>
                <Separator />

                {senhaGerada ? (
                  <div className="space-y-3 rounded-lg border border-primary/40 bg-card p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Conta criada</p>
                      <p className="text-sm text-muted-foreground">
                        Repasse estes dados. A senha aparece só agora — ela não fica guardada em
                        lugar nenhum. Se perder, a pessoa entra por "Esqueci a senha".
                      </p>
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
{`E-mail: ${senhaGerada.email}
Senha provisória: ${senhaGerada.senha}`}
                    </pre>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copiarSenha} className="gap-1.5">
                        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiado ? 'Copiado' : 'Copiar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSenhaGerada(null)}>
                        Fechar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={criar} className="space-y-4">
                    <p className="text-sm font-medium text-foreground">Adicionar pessoa</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="equipe-email" className="text-xs">E-mail</Label>
                        <Input
                          id="equipe-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="pessoa@empresa.com.br"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="equipe-papel" className="text-xs">Papel</Label>
                        <Select value={papel} onValueChange={(v) => setPapel(v as 'admin' | 'member')}>
                          <SelectTrigger id="equipe-papel"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Membro</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-3">
                        <Label htmlFor="equipe-nome" className="text-xs">Nome (opcional)</Label>
                        <Input
                          id="equipe-nome"
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          placeholder="Como a pessoa aparece na lista"
                        />
                      </div>
                    </div>
                    <Button type="submit" size="sm" disabled={criando || !email.trim()} className="gap-1.5">
                      {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Criar conta
                    </Button>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
