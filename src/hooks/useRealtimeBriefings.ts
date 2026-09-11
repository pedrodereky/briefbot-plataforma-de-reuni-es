import type { Tables } from '@/integrations/supabase/types';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export function useRealtimeBriefings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('briefings-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'briefings' },
        async (payload) => {
          const briefing = payload.new as Tables<'briefings'>;
          // Fetch the meeting title
          const { data: meeting } = await supabase
            .from('meetings')
            .select('id, title, user_id')
            .eq('id', briefing.meeting_id)
            .single();

          if (!meeting || meeting.user_id !== user.id) return;

          queryClient.invalidateQueries({ queryKey: ['briefings', meeting.id] });
          queryClient.invalidateQueries({ queryKey: ['meeting', meeting.id] });
          queryClient.invalidateQueries({ queryKey: ['meetings'] });

          toast({
            title: `Briefing gerado para "${meeting.title}"`,
            description: 'Clique para visualizar',
            action: undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast, queryClient, navigate]);
}
