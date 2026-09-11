import { mensagemDeErro } from '@/lib/errors';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, Trash2, Users, Mail, Building, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Contact {
  id: string;
  name: string;
  email: string;
  role: string | null;
  company: string | null;
  notes: string | null;
  meeting_count: number | null;
  last_meeting_at: string | null;
}

export default function ContactsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user!.id)
        .order('name');
      return (data ?? []) as Contact[];
    },
    enabled: !!user,
  });

  const filtered = search.trim()
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.company?.toLowerCase().includes(search.toLowerCase()))
      )
    : contacts;

  const openNew = () => {
    setEditContact(null);
    setName('');
    setEmail('');
    setRole('');
    setCompany('');
    setNotes('');
    setEditOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setName(c.name);
    setEmail(c.email);
    setRole(c.role || '');
    setCompany(c.company || '');
    setNotes(c.notes || '');
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!user || !name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      if (editContact) {
        await supabase
          .from('contacts')
          .update({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: role.trim() || null,
            company: company.trim() || null,
            notes: notes.trim() || null,
          })
          .eq('id', editContact.id);
        toast({ title: 'Contato atualizado!' });
      } else {
        await supabase.from('contacts').insert({
          user_id: user.id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: role.trim() || null,
          company: company.trim() || null,
          notes: notes.trim() || null,
        });
        toast({ title: 'Contato adicionado!' });
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditOpen(false);
    } catch (err) {
      toast({ title: 'Erro', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('contacts').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    toast({ title: 'Contato removido' });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Contatos</h1>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <Button onClick={openNew} className="gap-1">
          <Plus className="h-4 w-4" /> Novo Contato
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Participantes frequentes das suas reunioes. Novos participantes sao adicionados automaticamente.
      </p>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda. Adicione manualmente ou eles serao criados automaticamente ao criar reunioes.'}
            </p>
            {!search && (
              <Button variant="outline" onClick={openNew} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar contato
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:bg-accent/30 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">
                    {c.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.role && <Badge variant="secondary" className="text-[10px]">{c.role}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                      {c.company && (
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" /> {c.company}
                        </span>
                      )}
                      {(c.meeting_count ?? 0) > 0 && (
                        <span>{c.meeting_count} reuniao{(c.meeting_count ?? 0) !== 1 && 'es'}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover {c.name}?</AlertDialogTitle>
                        <AlertDialogDescription>O contato sera removido da sua lista.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(c.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Joao Silva" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" type="email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex: Product Manager" />
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex: Acme Inc" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observacoes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas sobre este contato..." rows={2} />
            </div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !email.trim()} className="w-full gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editContact ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
