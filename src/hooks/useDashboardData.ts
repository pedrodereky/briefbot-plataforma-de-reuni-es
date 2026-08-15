import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { Tables } from '@/integrations/supabase/types';

type Meeting = Tables<'meetings'>;

export function useDashboardData() {
  const { user } = useAuth();

  const meetingsQuery = useQuery({
    queryKey: ['meetings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user!.id)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Meeting[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const actionItemsQuery = useQuery({
    queryKey: ['action_items_open', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('action_items')
        .select('*', { count: 'exact', head: true })
        .eq('done', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const meetings = meetingsQuery.data ?? [];
  const now = new Date();

  // Week boundaries (Monday–Sunday)
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  const thisWeek = meetings.filter((m) => {
    const d = new Date(m.starts_at);
    return d >= monday && d < sunday;
  });

  const metrics = {
    meetingsThisWeek: thisWeek.length,
    briefingsSent: meetings.filter((m) => m.briefing_sent).length,
    summariesSent: meetings.filter((m) => m.summary_sent).length,
    openActionItems: actionItemsQuery.data ?? 0,
  };

  const upcoming = meetings
    .filter((m) => new Date(m.starts_at) >= now)
    .slice(0, 5);

  const recent = meetings
    .filter((m) => new Date(m.starts_at) < now)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 5);

  return {
    metrics,
    upcoming,
    recent,
    isLoading: meetingsQuery.isLoading || actionItemsQuery.isLoading,
  };
}
