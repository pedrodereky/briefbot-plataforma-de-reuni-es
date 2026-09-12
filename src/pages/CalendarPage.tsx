import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, addWeeks, subWeeks, addMonths, subMonths, isSameDay, isSameMonth, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PageHeader, PageBody } from '@/components/PageHeader';
import { getWeekDays, getMonthGrid, positionMeeting } from '@/lib/calendar-utils';
import { Tables } from '@/integrations/supabase/types';

type Meeting = Tables<'meetings'>;
type ViewMode = 'week' | 'month';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07-21

export default function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { createInstant, creating } = useCreateInstantMeeting();
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);

  const weekDays = getWeekDays(anchor);
  const monthGrid = getMonthGrid(anchor);
  const rangeStart = view === 'week' ? weekDays[0] : monthGrid[0][0];
  const rangeEnd = view === 'week' ? weekDays[6] : monthGrid[monthGrid.length - 1][6];

  const { data: meetings = [] } = useQuery({
    queryKey: ['calendar-meetings', user?.id, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const end = new Date(rangeEnd);
      end.setHours(23, 59, 59);
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user!.id)
        .gte('starts_at', rangeStart.toISOString())
        .lte('starts_at', end.toISOString())
        .order('starts_at');
      return (data ?? []) as Meeting[];
    },
    enabled: !!user,
  });

  const prev = () => setAnchor((d) => (view === 'week' ? subWeeks(d, 1) : subMonths(d, 1)));
  const next = () => setAnchor((d) => (view === 'week' ? addWeeks(d, 1) : addMonths(d, 1)));
  const today = () => setAnchor(new Date());

  const getMeetingsForDay = (day: Date) =>
    meetings.filter((m) => isSameDay(new Date(m.starts_at), day));

  return (
    <>
      <PageHeader
        titulo="Agenda"
        acoes={
          <>
            <Button variant="outline" size="sm" onClick={() => createInstant()} disabled={creating} className="gap-1.5">
              <Zap className="h-4 w-4" /> Iniciar agora
            </Button>
            <CreateMeetingDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Nova reunião
                </Button>
              }
            />
          </>
        }
      />
      <PageBody className="space-y-4">

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={today}>Hoje</Button>
          <h2 className="text-lg font-semibold ml-2">
            {view === 'week'
              ? `${format(weekDays[0], "dd MMM", { locale: ptBR })} - ${format(weekDays[6], "dd MMM yyyy", { locale: ptBR })}`
              : format(anchor, "MMMM yyyy", { locale: ptBR })
            }
          </h2>
        </div>
        <div className="flex rounded-lg border overflow-hidden">
          <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setView('week')} className="rounded-none">Semana</Button>
          <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" onClick={() => setView('month')} className="rounded-none">Mês</Button>
        </div>
      </div>

      {/* Calendar Grid */}
      {view === 'week' ? (
        <WeekView days={weekDays} meetings={meetings} onMeetingClick={(id) => navigate(`/meetings/${id}`)} />
      ) : (
        <MonthView grid={monthGrid} anchor={anchor} getMeetings={getMeetingsForDay} onMeetingClick={(id) => navigate(`/meetings/${id}`)} />
      )}
      </PageBody>
    </>
  );
}

function WeekView({
  days, meetings, onMeetingClick,
}: {
  days: Date[]; meetings: Meeting[]; onMeetingClick: (id: string) => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="p-2" />
        {days.map((d) => (
          <div key={d.toISOString()} className={cn('p-2 text-center text-sm border-l', isToday(d) && 'bg-primary/5')}>
            <div className="text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</div>
            <div className={cn('font-semibold', isToday(d) && 'text-primary')}>{format(d, 'dd')}</div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative" style={{ height: '600px' }}>
        {/* Hour labels */}
        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="absolute w-full text-right pr-2 text-xs text-muted-foreground" style={{ top: `${((h - 7) / 15) * 100}%` }}>
              {String(h).padStart(2, '0')}h
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((day) => {
          const dayMeetings = meetings.filter((m) => isSameDay(new Date(m.starts_at), day));
          return (
            <div key={day.toISOString()} className={cn('relative border-l', isToday(day) && 'bg-primary/5')}>
              {/* Hour lines */}
              {HOURS.map((h) => (
                <div key={h} className="absolute w-full border-t border-border/50" style={{ top: `${((h - 7) / 15) * 100}%` }} />
              ))}
              {/* Meetings */}
              {dayMeetings.map((m) => {
                const pos = positionMeeting(m.starts_at, m.ends_at);
                const statusColor = m.meeting_status === 'live' ? 'bg-live' : m.meeting_status === 'ended' ? 'bg-muted-foreground' : 'bg-primary';
                return (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m.id)}
                    className={cn('absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-[11px] text-white font-medium overflow-hidden cursor-pointer hover:opacity-90', statusColor)}
                    style={{ top: pos.top, height: pos.height, minHeight: '18px' }}
                    title={m.title}
                  >
                    {format(new Date(m.starts_at), 'HH:mm')} {m.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function MonthView({
  grid, anchor, getMeetings, onMeetingClick,
}: {
  grid: Date[][]; anchor: Date; getMeetings: (d: Date) => Meeting[]; onMeetingClick: (id: string) => void;
}) {
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7">
        {dayNames.map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b">{d}</div>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 min-h-[100px]">
          {week.map((day) => {
            const dayMeetings = getMeetings(day);
            const inMonth = isSameMonth(day, anchor);
            return (
              <div key={day.toISOString()} className={cn('border-t border-l p-1', !inMonth && 'opacity-40')}>
                <div className={cn('text-xs font-medium mb-1', isToday(day) && 'text-primary font-bold')}>
                  {format(day, 'd')}
                </div>
                {dayMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m.id)}
                    className="block w-full text-left text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5 mb-0.5 truncate hover:bg-primary/20 cursor-pointer"
                  >
                    {format(new Date(m.starts_at), 'HH:mm')} {m.title}
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayMeetings.length - 3} mais</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

