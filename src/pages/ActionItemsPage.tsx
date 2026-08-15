import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { Tables } from '@/integrations/supabase/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionItem = Tables<'action_items'>;
type Meeting = Tables<'meetings'>;

type Filter = 'all' | 'open' | 'done';

export default function ActionItemsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data as Pick<Meeting, 'id' | 'title'>[];
    },
    enabled: !!user,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['all_action_items', user?.id, filter],
    queryFn: async () => {
      const meetingIds = meetings.map((m) => m.id);
      if (meetingIds.length === 0) return [];
      let query = supabase
        .from('action_items')
        .select('*')
        .in('meeting_id', meetingIds);
      if (filter === 'open') query = query.eq('done', false);
      if (filter === 'done') query = query.eq('done', true);
      const { data, error } = await query;
      if (error) throw error;
      return data as ActionItem[];
    },
    enabled: !!user && meetings.length > 0,
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('action_items').update({ done }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all_action_items'] });
      queryClient.invalidateQueries({ queryKey: ['action_items_open'] });
    },
  });

  const meetingMap = Object.fromEntries(meetings.map((m) => [m.id, m.title]));

  // Sort: items with due_date ASC first, then items without due_date
  const sorted = [...items].sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });

  // Group by meeting
  const grouped = sorted.reduce<Record<string, ActionItem[]>>((acc, item) => {
    (acc[item.meeting_id] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Action Items</h1>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abertos</SelectItem>
            <SelectItem value="done">Concluídos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
          <ListChecks className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Nenhum action item ainda. Gere uma ata para extraí-los automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([meetingId, groupItems]) => (
            <div key={meetingId} className="space-y-3">
              <button
                className="text-sm font-semibold text-primary hover:underline"
                onClick={() => navigate(`/meetings/${meetingId}`)}
              >
                {meetingMap[meetingId] ?? 'Reunião'}
              </button>
              <div className="space-y-2">
                {groupItems.map((item) => (
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
                    {item.done ? (
                      <Badge variant="secondary" className="text-xs">Concluído</Badge>
                    ) : (
                      <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">Aberto</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
