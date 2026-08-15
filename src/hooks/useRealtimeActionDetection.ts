import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DetectedAction {
  owner: string;
  task: string;
  due_date: string | null;
}

const DETECTION_INTERVAL_MS = 60_000; // every 60 seconds
const MIN_NEW_TRANSCRIPTS = 3; // minimum new lines before calling AI

export function useRealtimeActionDetection(meetingId: string | undefined, enabled: boolean) {
  const [detectedItems, setDetectedItems] = useState<DetectedAction[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const lastTimestampRef = useRef<string | null>(null);
  const transcriptCountRef = useRef(0);
  const { toast } = useToast();

  const detect = useCallback(async () => {
    if (!meetingId || isDetecting) return;

    // Check if enough new transcripts have accumulated
    const { count } = await supabase
      .from('meeting_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('meeting_id', meetingId)
      .eq('is_final', true)
      .gt('timestamp', lastTimestampRef.current || '1970-01-01');

    if ((count ?? 0) < MIN_NEW_TRANSCRIPTS) return;

    setIsDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('detect-action-items', {
        body: {
          meeting_id: meetingId,
          since_timestamp: lastTimestampRef.current,
        },
      });

      if (error) throw error;

      if (data?.action_items?.length > 0) {
        setDetectedItems((prev) => [...prev, ...data.action_items]);
        toast({
          title: `${data.action_items.length} action item(s) detectado(s)`,
          description: data.action_items.map((a: DetectedAction) => a.task).join(', '),
        });
      }

      if (data?.last_timestamp) {
        lastTimestampRef.current = data.last_timestamp;
      }
    } catch (err) {
      console.error('Action detection error:', err);
    } finally {
      setIsDetecting(false);
    }
  }, [meetingId, isDetecting, toast]);

  useEffect(() => {
    if (!meetingId || !enabled) return;

    const interval = setInterval(detect, DETECTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [meetingId, enabled, detect]);

  return { detectedItems, isDetecting, detectNow: detect };
}
