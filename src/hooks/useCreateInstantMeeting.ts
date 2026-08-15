import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export function useCreateInstantMeeting() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const createInstant = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: 'Reuniao Rapida',
          starts_at: new Date().toISOString(),
          calendar_event_id: crypto.randomUUID(),
          meeting_status: 'lobby',
          organizer: user.email || null,
          attendees: [] as any,
        })
        .select('id')
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      navigate(`/meetings/${meeting.id}/room`);
    } catch (err: any) {
      toast({ title: 'Erro ao criar reuniao', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return { createInstant, creating };
}
