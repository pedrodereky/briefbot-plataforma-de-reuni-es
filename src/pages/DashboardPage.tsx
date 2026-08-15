import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Send, FileText, ListChecks, Clock, Zap, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { Tables } from '@/integrations/supabase/types';

type Meeting = Tables<'meetings'>;

function formatDatePtBR(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const AVATAR_COLORS = [
  'bg-primary text-primary-foreground',
  'bg-destructive text-destructive-foreground',
  'bg-accent text-accent-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-muted text-muted-foreground',
];

function getInitials(email: string) {
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

function AttendeesStack({ attendees }: { attendees: string[] }) {
  const shown = attendees.slice(0, 4);
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

function getStatusBadge(meeting: Meeting) {
  const now = new Date();
  const start = new Date(meeting.starts_at);

  if (meeting.meeting_status === 'live') {
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs animate-pulse hover:bg-destructive/20">Ao vivo</Badge>;
  }
  if (meeting.meeting_status === 'ended' && !meeting.summary_sent) {
    return <Badge className="bg-info/15 text-info border-info/30 text-xs hover:bg-info/20">Gerando resumo...</Badge>;
  }
  if (meeting.summary_sent) {
    return <Badge variant="secondary" className="text-xs">Concluida</Badge>;
  }
  if (start < now && !meeting.summary_sent) {
    return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs hover:bg-warning/20">Ata pendente</Badge>;
  }
  if (meeting.briefing_sent) {
    return <Badge className="bg-success/15 text-success border-success/30 text-xs hover:bg-success/20">Briefing enviado</Badge>;
  }
  return <Badge className="bg-accent text-accent-foreground border-accent text-xs">Briefing pendente</Badge>;
}

function MeetingCard({ meeting, compact }: { meeting: Meeting; compact?: boolean }) {
  const navigate = useNavigate();
  const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : [];

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-card hover:bg-accent/30"
      onClick={() => navigate(`/meetings/${meeting.id}`)}
    >
      <CardContent className={compact ? 'flex items-center justify-between gap-4 p-4' : 'p-5'}>
        <div className={compact ? 'min-w-0 flex-1' : ''}>
          <h3 className={`font-medium leading-tight ${compact ? 'text-sm' : 'text-base'}`}>
            {meeting.title}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDatePtBR(meeting.starts_at)}
          </p>
        </div>
        <div className={compact ? 'flex items-center gap-3' : 'mt-3 flex items-center justify-between'}>
          {attendees.length > 0 && <AttendeesStack attendees={attendees} />}
          {getStatusBadge(meeting)}
        </div>
      </CardContent>
    </Card>
  );
}

const metricCards = [
  { key: 'meetingsThisWeek' as const, label: 'Reuniões esta semana', icon: Calendar },
  { key: 'briefingsSent' as const, label: 'Briefings enviados', icon: Send },
  { key: 'summariesSent' as const, label: 'Atas geradas', icon: FileText },
  { key: 'openActionItems' as const, label: 'Action items abertos', icon: ListChecks },
];

export default function DashboardPage() {
  const { metrics, upcoming, recent, isLoading } = useDashboardData();
  const { createInstant, creating } = useCreateInstantMeeting();
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => createInstant()} disabled={creating} className="gap-1">
            <Zap className="h-4 w-4" /> Iniciar Agora
          </Button>
          <CreateMeetingDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            trigger={<Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Nova Reuniao</Button>}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Próximas reuniões</h2>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma reuniao encontrada. Crie uma nova reuniao.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </section>

      {/* Recent */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Reuniões recentes</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma reunião passada encontrada.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => (
              <MeetingCard key={m.id} meeting={m} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
