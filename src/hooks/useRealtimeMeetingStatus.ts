import type { Tables } from '@/integrations/supabase/types';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeMeetingStatus(meetingId: string | undefined) {
  const [status, setStatus] = useState<string>('scheduled');

  useEffect(() => {
    if (!meetingId) return;

    // Load initial status
    const loadStatus = async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('meeting_status')
        .eq('id', meetingId)
        .maybeSingle();

      if (error) return;

      if (data) {
        setStatus(data.meeting_status);
      }
    };

    loadStatus();

    // Subscribe to status changes
    const channel = supabase
      .channel(`meeting-status-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meetings',
          filter: `id=eq.${meetingId}`,
        },
        (payload) => {
          const newStatus = (payload.new as Tables<'meetings'>).meeting_status;
          if (newStatus) {
            setStatus(newStatus);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId]);

  return status;
}
