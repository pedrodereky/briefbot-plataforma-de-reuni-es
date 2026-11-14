import type { Tables } from '@/integrations/supabase/types';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Convidados (anônimos) não leem `meetings` nem recebem o Realtime da tabela:
// para eles o status vem da RPC get_join_meeting, consultada periodicamente.
const INTERVALO_CONVIDADO_MS = 10_000;

export function useRealtimeMeetingStatus(
  meetingId: string | undefined,
  { joinToken }: { joinToken?: string | null } = {},
) {
  const [status, setStatus] = useState<string>('scheduled');

  useEffect(() => {
    if (!meetingId || !joinToken) return;

    let ativo = true;
    const carregar = async () => {
      const { data, error } = await supabase.rpc('get_join_meeting', {
        _meeting_id: meetingId,
        _token: joinToken,
      });
      if (!ativo || error) return;
      const novo = data?.[0]?.meeting_status;
      if (novo) setStatus(novo);
    };

    carregar();
    const timer = setInterval(carregar, INTERVALO_CONVIDADO_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [meetingId, joinToken]);

  useEffect(() => {
    if (!meetingId || joinToken) return;

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
  }, [meetingId, joinToken]);

  return status;
}
