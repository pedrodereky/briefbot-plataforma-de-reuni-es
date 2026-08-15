import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TranscriptEntry {
  id: string;
  participant_id: string;
  participant_name: string;
  text: string;
  is_final: boolean;
  timestamp: string;
}

export function useRealtimeTranscripts(meetingId: string | undefined) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const transcriptsRef = useRef<TranscriptEntry[]>([]);

  useEffect(() => {
    if (!meetingId) return;

    // Load existing transcripts
    const loadExisting = async () => {
      const { data } = await supabase
        .from('meeting_transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('is_final', true)
        .order('timestamp', { ascending: true });

      if (data) {
        const entries = data.map((t) => ({
          id: t.id,
          participant_id: t.participant_id,
          participant_name: t.participant_name,
          text: t.text,
          is_final: t.is_final ?? true,
          timestamp: t.timestamp ?? t.created_at ?? '',
        }));
        transcriptsRef.current = entries;
        setTranscripts(entries);
      }
    };

    loadExisting();

    // Subscribe to new transcripts
    const channel = supabase
      .channel(`transcripts-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meeting_transcripts',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const t = payload.new as any;
          if (!t.is_final) return;

          const entry: TranscriptEntry = {
            id: t.id,
            participant_id: t.participant_id,
            participant_name: t.participant_name,
            text: t.text,
            is_final: t.is_final,
            timestamp: t.timestamp ?? t.created_at ?? '',
          };

          // Avoid duplicates
          if (transcriptsRef.current.some((e) => e.id === entry.id)) return;

          transcriptsRef.current = [...transcriptsRef.current, entry];
          setTranscripts(transcriptsRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId]);

  return transcripts;
}
