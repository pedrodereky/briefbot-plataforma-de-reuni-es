import type { TablesUpdate } from '@/integrations/supabase/types';
import { mensagemDeErro } from '@/lib/errors';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { format, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Clock, Users, Loader2, Plus, CalendarIcon, Video, Link2, Copy,
  XCircle, CalendarClock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { TranscriptTab } from '@/components/meeting-detail/TranscriptTab';
import { InsightsTab } from '@/components/meeting-detail/InsightsTab';
import { ExportButtons } from '@/components/meeting-detail/ExportButtons';
import { RecordingTab } from '@/components/meeting-detail/RecordingTab';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buildJoinLink } from '@/lib/join-link';

type Meeting = Tables<'meetings'>;
type Briefing = Tables<'briefings'>;
type ActionItem = Tables<'action_items'>;

const AVATAR_COLORS = [
  'bg-primary text-primary-foreground',
  'bg-destructive text-destructive-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-accent text-accent-foreground',
  'bg-muted text-muted-foreground',
];

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

// ─── Header ───────────────────────────────────────────────

function MeetingHeader({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : [];
  const start = new Date(meeting.starts_at);
  const end = meeting.ends_at ? new Date(meeting.ends_at) : null;
  const duration = end ? differenceInMinutes(end, start) : null;

  const [cancelling, setCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(start);
  const [rescheduleTime, setRescheduleTime] = useState(format(start, 'HH:mm'));
  const [rescheduling, setRescheduling] = useState(false);

  const isCancelled = meeting.meeting_status === 'cancelled';
  const isEnded = meeting.meeting_status === 'ended';
  const canModify = !isCancelled && !isEnded && meeting.meeting_status !== 'live';

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('meetings')
        .update({ meeting_status: 'cancelled' })
        .eq('id', meeting.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      toast({ title: 'Reunião cancelada' });
    } catch (err) {
      toast({ title: 'Erro ao cancelar', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) return;
    setRescheduling(true);
    try {
      const [hours, minutes] = rescheduleTime.split(':').map(Number);
      const newStart = new Date(rescheduleDate);
      newStart.setHours(hours, minutes, 0, 0);

      // Keep same duration
      const updates: TablesUpdate<'meetings'> = { starts_at: newStart.toISOString() };
      if (end && duration) {
        const newEnd = new Date(newStart.getTime() + duration * 60_000);
        updates.ends_at = newEnd.toISOString();
      }

      const { error } = await supabase
        .from('meetings')
        .update(updates)
        .eq('id', meeting.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      setRescheduleOpen(false);
      toast({ title: 'Reunião reagendada' });
    } catch (err) {
      toast({ title: 'Erro ao reagendar', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{meeting.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {format(start, "EEEE, dd MMM yyyy • HH'h'mm", { locale: ptBR })}
            {duration != null && ` (${duration} min)`}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {attendees.length + 1} participante{attendees.length + 1 !== 1 && 's'}
          </span>
        </div>

        {/* Attendee avatars */}
        {attendees.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attendees.map((email, i) => (
              <div key={email} className="flex items-center gap-1.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  {getInitials(email)}
                </div>
                <span className="text-xs text-muted-foreground">{email}</span>
              </div>
            ))}
          </div>
        )}

        {/* Status badges */}
        <div className="flex gap-2 pt-1">
          {isCancelled && (
            <Badge variant="destructive" className="text-xs">Cancelada</Badge>
          )}
          {!isCancelled && meeting.briefing_sent ? (
            <Badge className="bg-success/15 text-success border-success/30 text-xs">Briefing enviado</Badge>
          ) : !isCancelled && (
            <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">Briefing pendente</Badge>
          )}
          {meeting.summary_sent ? (
            <Badge className="bg-success/15 text-success border-success/30 text-xs">Ata gerada</Badge>
          ) : !isCancelled && (
            <Badge className="bg-accent text-accent-foreground border-accent text-xs">Ata pendente</Badge>
          )}
          {meeting.meeting_status === 'live' && (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs animate-pulse">Ao vivo</Badge>
          )}
          {isEnded && (
            <Badge variant="secondary" className="text-xs">Encerrada</Badge>
          )}
        </div>

        {/* Meeting room actions */}
        {canModify && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => navigate(`/meetings/${meeting.id}/room`)}
              className="gap-2"
            >
              <Video className="h-4 w-4" />
              Iniciar Reuniao
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = buildJoinLink(meeting.id, meeting.join_token);
                if (!link) {
                  toast({
                    title: 'Link indisponivel',
                    description: 'Esta reuniao ainda nao tem token de convite.',
                    variant: 'destructive',
                  });
                  return;
                }
                navigator.clipboard.writeText(link);
                toast({ title: 'Link de convite copiado!' });
              }}
              className="gap-1"
            >
              <Link2 className="h-3.5 w-3.5" />
              Copiar link de convite
            </Button>

            {/* Reschedule */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRescheduleOpen(true)}
              className="gap-1"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Reagendar
            </Button>

            {/* Cancel */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar reunião?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Essa ação marcará a reunião como cancelada. Os participantes não serão notificados automaticamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar cancelamento'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Live meeting actions */}
        {meeting.meeting_status === 'live' && (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => navigate(`/meetings/${meeting.id}/room`)} className="gap-2">
              <Video className="h-4 w-4" />
              Entrar na Reuniao
            </Button>
          </div>
        )}

        {/* Reschedule dialog */}
        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reagendar reunião</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nova data</Label>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-md border"
                />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancelar</Button>
              <Button onClick={handleReschedule} disabled={rescheduling || !rescheduleDate}>
                {rescheduling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ─── Briefing Tab ─────────────────────────────────────────

function BriefingTab({ meeting, briefing }: { meeting: Meeting; briefing: Briefing | null }) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const sendNotifications = async (briefingId: string) => {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('slack_enabled')
      .eq('user_id', user!.id)
      .single();

    if (settings?.slack_enabled) {
      const { data, error } = await supabase.functions.invoke('send-slack', {
        body: { briefing_id: briefingId },
      });
      if (error || !data?.success) {
        console.error('Send Slack error:', error ?? data?.error);
        toast({ title: 'Falha ao enviar para o Slack', variant: 'destructive' });
      } else {
        toast({ title: 'Mensagem enviada para o Slack' });
      }
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-briefing', {
        body: { meeting_id: meeting.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');
      toast({ title: 'Briefing gerado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      queryClient.invalidateQueries({ queryKey: ['briefings', meeting.id] });

      if (data.briefing_id) {
        await sendNotifications(data.briefing_id);
      }
    } catch (err) {
      console.error('Generate briefing error:', err);
      toast({ title: 'Erro ao gerar briefing', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (meeting.briefing_sent && briefing) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown>{briefing.content_md}</ReactMarkdown>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-muted-foreground">Briefing ainda não gerado</p>
        <Button onClick={handleGenerate} disabled={generating} className="gap-2">
          {generating && <Loader2 className="h-4 w-4 animate-spin" />}
          Gerar briefing agora
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Summary Tab (Ata) ────────────────────────────────────

function SummaryTab({ meeting, summary }: { meeting: Meeting; summary: Briefing | null }) {
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAta, setManualAta] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const autoTriggered = useRef(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if live transcript exists
  const { data: hasLiveTranscript } = useQuery({
    queryKey: ['transcript-count', meeting.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('meeting_transcripts')
        .select('id', { count: 'exact', head: true })
        .eq('meeting_id', meeting.id)
        .eq('is_final', true);
      return (count ?? 0) > 0;
    },
  });

  const sendNotifications = async (meetingId: string) => {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('slack_enabled')
      .eq('user_id', user!.id)
      .single();

    const { data: postBriefing } = await supabase
      .from('briefings')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('type', 'post')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!postBriefing) return;

    if (settings?.slack_enabled) {
      const { data, error } = await supabase.functions.invoke('send-slack', {
        body: { briefing_id: postBriefing.id },
      });
      if (error || !data?.success) {
        console.error('Send Slack error:', error ?? data?.error);
      } else {
        toast({ title: 'Mensagem enviada para o Slack' });
      }
    }
  };

  const doGenerate = async () => {
    setGenerating(true);
    try {
      const body: Record<string, unknown> = {
        meeting_id: meeting.id,
        use_live_transcript: true,
      };

      const { data, error } = await supabase.functions.invoke('generate-summary', { body });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      toast({ title: 'Ata gerada automaticamente!', description: `${data.action_items_count} action items extraidos.` });
      queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      queryClient.invalidateQueries({ queryKey: ['briefings', meeting.id] });
      queryClient.invalidateQueries({ queryKey: ['action_items', meeting.id] });

      await sendNotifications(meeting.id);
    } catch (err) {
      toast({ title: 'Erro ao gerar ata', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // `doGenerate` é recriado a cada render e fecha sobre estado que muda, mas o
  // efeito abaixo só deve reagir às CONDIÇÕES de disparo — colocá-lo no array
  // de dependências re-executaria o efeito a cada render. A referência sempre
  // aponta para a versão mais recente, então não há closure obsoleta.
  const doGenerateRef = useRef(doGenerate);
  useEffect(() => {
    doGenerateRef.current = doGenerate;
  });

  // Gera a ata sozinho quando a transcrição fica disponível e ainda não há
  // resumo. `autoTriggered` garante uma única execução por montagem — era o
  // que já impedia a geração duplicada que o estado `generating` obsoleto
  // poderia causar.
  useEffect(() => {
    if (hasLiveTranscript && !meeting.summary_sent && !summary && !autoTriggered.current) {
      autoTriggered.current = true;
      doGenerateRef.current();
    }
  }, [hasLiveTranscript, meeting.summary_sent, summary]);

  const handleSaveEdit = async () => {
    if (!summary) return;
    try {
      await supabase
        .from('briefings')
        .update({ content_md: editContent })
        .eq('id', summary.id);
      queryClient.invalidateQueries({ queryKey: ['briefings', meeting.id] });
      setEditing(false);
      toast({ title: 'Ata atualizada!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  };

  const handleSaveManualAta = async () => {
    if (!manualAta.trim()) return;
    setSavingManual(true);
    try {
      await supabase.from('briefings').insert({
        meeting_id: meeting.id,
        type: 'post',
        content_md: manualAta.trim(),
        sent_at: new Date().toISOString(),
      });
      await supabase.from('meetings').update({ summary_sent: true }).eq('id', meeting.id);
      queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
      queryClient.invalidateQueries({ queryKey: ['briefings', meeting.id] });
      toast({ title: 'Ata salva!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSavingManual(false);
    }
  };

  // ── Ata already generated — show content with edit option ──
  if (meeting.summary_sent && summary) {
    return (
      <div className="space-y-4">
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="gap-1">
                Salvar alteracoes
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditContent(summary.content_md); setEditing(true); }}
              >
                Editar ata
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { autoTriggered.current = false; doGenerate(); }}
                disabled={generating}
                className="gap-1"
              >
                {generating && <Loader2 className="h-3 w-3 animate-spin" />}
                Regerar com IA
              </Button>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{summary.content_md}</ReactMarkdown>
            </div>
            <ExportButtons meeting={meeting} summaryContent={summary.content_md} />
          </div>
        )}
      </div>
    );
  }

  // ── Generating in progress ──
  if (generating) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Gerando ata automaticamente a partir da transcricao...</p>
      </div>
    );
  }

  // ── No transcript yet — show waiting state or manual option ──
  return (
    <div className="space-y-6">
      {!hasLiveTranscript && !showManualForm && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-10">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            A ata sera gerada automaticamente quando houver uma transcricao da reuniao.
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            Inicie uma reuniao ao vivo para gerar a transcricao, ou escreva a ata manualmente.
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowManualForm(true)}>
            Escrever manualmente
          </Button>
        </div>
      )}

      {hasLiveTranscript && !generating && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-10">
          <p className="text-sm text-muted-foreground text-center">
            Transcricao disponivel. A ata sera gerada automaticamente.
          </p>
          <Button onClick={doGenerate} className="gap-2">
            <Loader2 className="h-4 w-4" />
            Gerar agora
          </Button>
        </div>
      )}

      {showManualForm && (
        <>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm font-medium">Escreva ou cole sua ata abaixo (suporta Markdown):</p>
              <Textarea
                value={manualAta}
                onChange={(e) => setManualAta(e.target.value)}
                placeholder={"## Resumo\n\nDescreva os pontos discutidos...\n\n## Decisoes\n\n- ...\n\n## Action Items\n\n- [Responsavel] → [Tarefa] → [Prazo]"}
                rows={15}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button
              onClick={handleSaveManualAta}
              disabled={savingManual || !manualAta.trim()}
              className="gap-2"
            >
              {savingManual && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar ata
            </Button>
            <Button variant="outline" onClick={() => setShowManualForm(false)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Action Items Tab ─────────────────────────────────────

function ActionItemsTab({ meetingId }: { meetingId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [owner, setOwner] = useState('');
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState<Date>();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['action_items', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as ActionItem[];
    },
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('action_items').update({ done }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action_items', meetingId] }),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('action_items').insert({
        meeting_id: meetingId,
        owner: owner.trim(),
        task: task.trim(),
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action_items', meetingId] });
      setOwner('');
      setTask('');
      setDueDate(undefined);
      setShowForm(false);
      toast({ title: 'Item adicionado' });
    },
    onError: () => toast({ title: 'Erro ao adicionar item', variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && !showForm && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Nenhum action item ainda. Gere uma ata para extraí-los automaticamente.
          </p>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox
            checked={!!item.done}
            onCheckedChange={(checked) => toggleDone.mutate({ id: item.id, done: !!checked })}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm', item.done && 'text-muted-foreground line-through')}>
              {item.task}
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Responsável: {item.owner}</span>
              {item.due_date && (
                <span>Prazo: {format(new Date(item.due_date), 'dd/MM/yyyy')}</span>
              )}
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input placeholder="Responsável" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <Input placeholder="Tarefa" value={task} onChange={(e) => setTask(e.target.value)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dueDate && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate ? format(dueDate, 'dd/MM/yyyy') : 'Prazo (opcional)'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addItem.mutate()} disabled={!owner.trim() || !task.trim() || addItem.isPending}>
              {addItem.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Adicionar item
        </Button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: meeting, isLoading: loadingMeeting } = useQuery({
    queryKey: ['meeting', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    enabled: !!id && !!user,
  });

  const { data: briefings = [] } = useQuery({
    queryKey: ['briefings', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('briefings')
        .select('*')
        .eq('meeting_id', id!);
      if (error) throw error;
      return data as Briefing[];
    },
    enabled: !!id && !!user,
  });

  const safeBriefings = Array.isArray(briefings) ? briefings : [];
  const preBriefing = safeBriefings.find((b) => b.type === 'pre') ?? null;
  const postBriefing = safeBriefings.find((b) => b.type === 'post') ?? null;

  if (loadingMeeting) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Reunião não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MeetingHeader meeting={meeting} />

      <Tabs defaultValue="briefing">
        <TabsList>
          <TabsTrigger value="briefing">Briefing Pre</TabsTrigger>
          <TabsTrigger value="summary">Ata</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="transcript">Transcricao</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="recording">Gravacao</TabsTrigger>
        </TabsList>

        <TabsContent value="briefing" className="mt-4">
          <BriefingTab meeting={meeting} briefing={preBriefing} />
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <SummaryTab meeting={meeting} summary={postBriefing} />
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <ActionItemsTab meetingId={meeting.id} />
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <TranscriptTab meetingId={meeting.id} />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <InsightsTab meeting={meeting} />
        </TabsContent>

        <TabsContent value="recording" className="mt-4">
          <RecordingTab meetingId={meeting.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
