import { encontrarConflitos } from '@/lib/ics';
import type { Json } from '@/integrations/supabase/types';
import { mensagemDeErro } from '@/lib/errors';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, Plus, ArrowRight, ArrowLeft, Sparkles,
  X, Users, FileText, Clock, Target, Check, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateMeetingDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function CreateMeetingDialog({ open, onOpenChange, trigger }: CreateMeetingDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0); // 0=basico, 1=pauta, 2=participantes, 3=revisar
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Step 0: Basico
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('30');
  const [meetingType, setMeetingType] = useState('alinhamento');

  // Step 1: Pauta e objetivos
  const [objective, setObjective] = useState('');
  const [agenda, setAgenda] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Participantes
  const [emailInput, setEmailInput] = useState('');
  const [attendeesList, setAttendeesList] = useState<string[]>([]);
  const [newContactNames, setNewContactNames] = useState<Record<string, string>>({});

  // Contacts for quick selection
  // Reuniões já agendadas, para avisar sobre choque de horário (auditoria
  // P1 item 13). Só as futuras importam.
  const { data: agendadas = [] } = useQuery({
    queryKey: ['meetings_para_conflito', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, title, starts_at, ends_at')
        .eq('user_id', user!.id)
        .neq('meeting_status', 'cancelled')
        .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      return data ?? [];
    },
    enabled: !!user && open,
  });

  const conflitos = useMemo(() => {
    if (!date) return [];
    const [h, m] = time.split(':').map(Number);
    const inicio = new Date(date);
    inicio.setHours(h, m, 0, 0);
    const fim = new Date(inicio.getTime() + parseInt(duration) * 60 * 1000);
    return encontrarConflitos(
      { id: 'nova', title, starts_at: inicio.toISOString(), ends_at: fim.toISOString() },
      agendadas,
    );
  }, [date, time, duration, title, agendadas]);

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, email, role, company, meeting_count')
        .eq('user_id', user!.id)
        .order('meeting_count', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const reset = () => {
    setStep(0);
    setTitle('');
    setDate(undefined);
    setTime('09:00');
    setDuration('30');
    setMeetingType('alinhamento');
    setObjective('');
    setAgenda('');
    setDescription('');
    setEmailInput('');
    setAttendeesList([]);
    setNewContactNames({});
  };

  const addAttendee = () => {
    const emails = emailInput
      .split(/[,;\n\s]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@') && !attendeesList.includes(e));
    if (emails.length > 0) {
      setAttendeesList((prev) => [...prev, ...emails]);
      setEmailInput('');
    }
  };

  const removeAttendee = (email: string) => {
    setAttendeesList((prev) => prev.filter((e) => e !== email));
  };

  // AI: Generate agenda/objective suggestions from title + type
  const generateWithAI = async () => {
    if (!title.trim()) {
      toast({ title: 'Preencha o título primeiro', variant: 'destructive' });
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-briefing', {
        body: {
          meeting_id: '__preview__',
          preview_data: {
            title: title.trim(),
            type: meetingType,
            duration,
            attendees: attendeesList,
            objective: objective.trim(),
            agenda: agenda.trim(),
          },
        },
      });

      // Parse AI suggestions into fields
      if (data?.preview) {
        const suggestions = data.preview;
        if (suggestions.objective) setObjective(suggestions.objective);
        if (suggestions.agenda) setAgenda(suggestions.agenda);
      } else if (data?.content) {
        setAgenda(data.content);
      }

      toast({ title: 'Sugestões geradas!' });
    } catch {
      toast({ title: 'Erro ao gerar sugestões', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!user || !title.trim() || !date) return;

    setSaving(true);
    try {
      const [h, m] = time.split(':').map(Number);
      const startsAt = new Date(date);
      startsAt.setHours(h, m, 0, 0);
      const endsAt = new Date(startsAt.getTime() + parseInt(duration) * 60 * 1000);

      // Build rich description from all fields
      let fullDescription = '';
      if (objective) fullDescription += `**Objetivo:** ${objective}\n\n`;
      if (agenda) fullDescription += `**Pauta:**\n${agenda}\n\n`;
      if (description) fullDescription += description;

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: fullDescription.trim() || null,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          attendees: attendeesList as unknown as Json,
          organizer: user.email || null,
          calendar_event_id: crypto.randomUUID(),
          meeting_status: 'scheduled',
        })
        .select('id')
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meetings-list'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-meetings'] });

      // Auto-save all attendees as contacts (with real names if provided)
      if (attendeesList.length > 0) {
        const existingEmails = new Set(contacts.map((c) => c.email));
        const newEmails = attendeesList.filter((e) => !existingEmails.has(e));
        if (newEmails.length > 0) {
          const newContacts = newEmails.map((email) => ({
            user_id: user.id,
            name: newContactNames[email] || email.split('@')[0],
            email,
          }));
          // O contato passou a ser único por ORGANIZAÇÃO, não por pessoa: o
          // índice contacts_user_email_idx deixou de existir, e apontar para
          // ele aqui faria o upsert falhar em silêncio.
          await supabase.from('contacts').upsert(newContacts, { onConflict: 'org_id,email', ignoreDuplicates: true });
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        }
        // Increment meeting_count for existing contacts
        const existingInMeeting = attendeesList.filter((e) => existingEmails.has(e));
        for (const email of existingInMeeting) {
          const contact = contacts?.find((c) => c.email === email);
          if (contact) {
            await supabase.from('contacts').update({ meeting_count: (contact.meeting_count || 0) + 1, last_meeting_at: new Date().toISOString() }).eq('id', contact.id);
          }
        }
      }

      // Always try to send invites when there are attendees
      if (attendeesList.length > 0) {
        try {
          const { data: result } = await supabase.functions.invoke('send-invite', {
            body: {
              meeting_id: meeting.id,
              app_url: window.location.origin,
            },
          });
          if (result?.sent > 0) {
            toast({ title: `Reunião criada! ${result.sent} convite(s) enviado(s).` });
          } else {
            toast({ title: 'Reunião criada!', description: 'Configure o Resend nas configurações para enviar convites por email.' });
          }
        } catch {
          toast({ title: 'Reunião criada!', description: 'Não foi possível enviar convites por email.' });
        }
      } else {
        toast({ title: 'Reunião criada!' });
      }

      // Auto-generate briefing pre-meeting (non-blocking)
      try {
        await supabase.functions.invoke('generate-briefing', {
          body: { meeting_id: meeting.id },
        });
      } catch {
        // Non-blocking
      }

      reset();
      onOpenChange?.(false);
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      toast({ title: 'Erro ao criar reunião', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return !!(title.trim() && date);
    return true;
  };

  const STEPS = ['Basico', 'Pauta', 'Participantes', 'Revisar'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange?.(v); }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Reunião</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 pb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <button
                onClick={() => i <= step && setStep(i)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  i < step ? 'bg-primary/10 text-primary' :
                  i === step ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                {label}
              </button>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 0: Basico */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título da reunião *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Alinhamento semanal, Revisao de sprint, 1:1 com Joao..."
                className="text-base"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de reunião</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alinhamento">Alinhamento / Status</SelectItem>
                  <SelectItem value="planejamento">Planejamento / Sprint</SelectItem>
                  <SelectItem value="one-on-one">1:1 / One-on-One</SelectItem>
                  <SelectItem value="brainstorm">Brainstorm / Ideacao</SelectItem>
                  <SelectItem value="revisao">Revisao / Retrospectiva</SelectItem>
                  <SelectItem value="decisao">Tomada de Decisao</SelectItem>
                  <SelectItem value="apresentacao">Apresentacao / Demo</SelectItem>
                  <SelectItem value="cliente">Reunião com Cliente</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, 'dd/MM/yy', { locale: ptBR }) : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label>Hora *</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1h</SelectItem>
                    <SelectItem value="90">1h30</SelectItem>
                    <SelectItem value="120">2h</SelectItem>
                    <SelectItem value="180">3h</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {conflitos.length > 0 && (
                <div className="sm:col-span-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="text-xs">
                    <p className="font-medium text-warning">
                      Choque de horário com {conflitos.length === 1 ? 'outra reunião' : `${conflitos.length} reuniões`}
                    </p>
                    <ul className="mt-0.5 text-muted-foreground">
                      {conflitos.map((c) => (
                        <li key={c.id}>
                          {c.title} — {format(new Date(c.starts_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-muted-foreground">
                      Você ainda pode agendar; este é só um aviso.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(1)} disabled={!canAdvance()} className="gap-1">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Pauta e objetivos */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Defina a pauta e objetivos</p>
              <Button
                variant="outline"
                size="sm"
                onClick={generateWithAI}
                disabled={aiLoading}
                className="gap-1"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Sugerir com IA
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Target className="h-3.5 w-3.5" /> Objetivo principal
              </Label>
              <Input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="O que queremos alcançar nesta reunião?"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Pauta / Topicos
              </Label>
              <Textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder={"1. Abertura e contexto\n2. Ponto principal\n3. Discussao\n4. Próximos passos"}
                rows={5}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Observacoes adicionais</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Links, documentos de referencia, preparacao necessária..."
                rows={3}
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(0)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(2)} className="gap-1">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Participantes */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Contacts quick-add */}
            {contacts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Seus contatos</Label>
                <div className="flex flex-wrap gap-1.5">
                  {contacts
                    .filter((c) => !attendeesList.includes(c.email))
                    .slice(0, 12)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAttendeesList((prev) => [...prev, c.email])}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                          {c.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-medium">{c.name}</span>
                        {c.role && <span className="text-muted-foreground">({c.role})</span>}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Manual email input */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Adicionar por email
              </Label>
              <div className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                  placeholder="email@exemplo.com"
                  className="flex-1"
                />
                <Button variant="outline" onClick={addAttendee} disabled={!emailInput.includes('@')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter para adicionar. Novos emails serão salvos nos seus contatos automaticamente.
              </p>
            </div>

            {/* Selected attendees — with name input for new contacts */}
            {attendeesList.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{attendeesList.length} participante{attendeesList.length !== 1 && 's'}</Label>
                <div className="space-y-1.5">
                  {attendeesList.map((email) => {
                    const contact = contacts.find((c) => c.email === email);
                    const isNew = !contact;
                    return (
                      <div key={email} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary shrink-0">
                          {(contact ? contact.name : newContactNames[email] || email)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isNew ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={newContactNames[email] || ''}
                                onChange={(e) => setNewContactNames((prev) => ({ ...prev, [email]: e.target.value }))}
                                placeholder="Nome do participante"
                                className="h-6 text-xs border-0 border-b border-dashed rounded-none px-0 focus-visible:ring-0"
                              />
                              <span className="text-[10px] text-muted-foreground shrink-0">{email}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{contact.name}</span>
                              <span className="text-[10px] text-muted-foreground">{email}</span>
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeAttendee(email)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {attendeesList.some((e) => !contacts.find((c) => c.email === e)) && (
                  <p className="text-[10px] text-muted-foreground">
                    Preencha os nomes para salvar como contatos. Na proxima vez, bastara clicar no nome.
                  </p>
                )}
              </div>
            )}

            {attendeesList.length === 0 && contacts.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-8 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum contato ainda. Adicione emails acima — eles serão salvos automaticamente.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(3)} className="gap-1">
                Revisar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Revisar e criar */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {date ? format(date, "EEEE, dd MMM yyyy", { locale: ptBR }) : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {time} ({duration} min)
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline">{meetingType}</Badge>
                </div>

                {objective && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Objetivo</p>
                      <p className="text-sm">{objective}</p>
                    </div>
                  </>
                )}

                {agenda && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Pauta</p>
                      <p className="text-sm whitespace-pre-line">{agenda}</p>
                    </div>
                  </>
                )}

                {description && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Observacoes</p>
                      <p className="text-sm whitespace-pre-line">{description}</p>
                    </div>
                  </>
                )}

                {attendeesList.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Participantes ({attendeesList.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {attendeesList.map((e) => (
                          <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={handleCreate} disabled={saving} className="gap-2 min-w-[160px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar Reunião
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
