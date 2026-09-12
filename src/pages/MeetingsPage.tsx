import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, CalendarOff, ChevronLeft, ChevronRight, Eye, Zap, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { Tables } from '@/integrations/supabase/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Meeting = Tables<'meetings'>;

const PAGE_SIZE = 20;

const AVATAR_COLORS = [
  'bg-primary text-primary-foreground',
  'bg-destructive text-destructive-foreground',
  'bg-accent text-accent-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-muted text-muted-foreground',
];

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function formatDatePtBR(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AttendeesStack({ attendees }: { attendees: string[] }) {
  const shown = attendees.slice(0, 3);
  const extra = attendees.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((email, i) => (
        <div
          key={email}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-medium ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
          title={email}
        >
          {getInitials(email)}
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  );
}

type Period = 'week' | 'month' | 'all';
type Status = 'all' | 'briefing' | 'summary' | 'pending';

function getPeriodRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {};
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    return { from: monday.toISOString(), to: sunday.toISOString() };
  }
  // month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: first.toISOString(), to: last.toISOString() };
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { createInstant, creating } = useCreateInstantMeeting();
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [status, setStatus] = useState<Status>('all');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['meetings-list', user?.id, search, period, status, page],
    queryFn: async () => {
      let query = supabase
        .from('meetings')
        .select('*', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('starts_at', { ascending: true });

      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      const range = getPeriodRange(period);
      if (range.from) query = query.gte('starts_at', range.from);
      if (range.to) query = query.lt('starts_at', range.to);

      if (status === 'briefing') query = query.eq('briefing_sent', true);
      if (status === 'summary') query = query.eq('summary_sent', true);
      if (status === 'pending') query = query.eq('briefing_sent', false).eq('summary_sent', false);

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      return { meetings: (data ?? []) as Meeting[], total: count ?? 0 };
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const meetings = data?.meetings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Reset page when filters change
  const updateSearch = (v: string) => { setSearch(v); setPage(0); };
  const updatePeriod = (v: Period) => { setPeriod(v); setPage(0); };
  const updateStatus = (v: Status) => { setStatus(v); setPage(0); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reuniões</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => createInstant()} disabled={creating} className="gap-1">
            <Zap className="h-4 w-4" /> Iniciar Agora
          </Button>
          <CreateMeetingDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            trigger={<Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Nova Reunião</Button>}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={period} onValueChange={(v) => updatePeriod(v as Period)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => updateStatus(v as Status)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="briefing">Com briefing</SelectItem>
            <SelectItem value="summary">Com ata</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
          </SelectContent>
        </Select>

      </div>

      {/* Table or Empty State */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
          <CalendarOff className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search || period !== 'all' || status !== 'all'
              ? 'Nenhuma reunião encontrada com esse filtro.'
              : 'Nenhuma reunião encontrada. Crie uma nova reunião.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Participantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Briefing</TableHead>
                  <TableHead>Ata</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : meetings.map((m) => {
                      const attendees = Array.isArray(m.attendees) ? (m.attendees as string[]) : [];
                      return (
                        <TableRow key={m.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/meetings/${m.id}`)}>
                          <TableCell className="font-medium">{m.title}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDatePtBR(m.starts_at)}
                          </TableCell>
                          <TableCell>
                            {attendees.length > 0 ? <AttendeesStack attendees={attendees} /> : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {m.meeting_status === 'live' ? (
                              <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs animate-pulse">Ao vivo</Badge>
                            ) : m.meeting_status === 'ended' ? (
                              <Badge variant="secondary" className="text-xs">Encerrada</Badge>
                            ) : m.meeting_status === 'lobby' ? (
                              <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">Lobby</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Agendada</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {m.briefing_sent ? (
                              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs hover:bg-green-500/20">Enviado</Badge>
                            ) : (
                              <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs hover:bg-yellow-500/20">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {m.summary_sent ? (
                              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs hover:bg-green-500/20">Gerada</Badge>
                            ) : (
                              <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs hover:bg-orange-500/20">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${m.id}`); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  Próxima <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
