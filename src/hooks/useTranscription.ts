import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptionSegment {
  text: string;
  is_final: boolean;
}

interface UseTranscriptionOptions {
  meetingId: string;
  participantId: string;
  participantName: string;
  enabled?: boolean;
}

export function useTranscription({
  meetingId,
  participantId,
  participantName,
  enabled = false,
}: UseTranscriptionOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (audioStream: MediaStream) => {
    setError(null);

    try {
      // Get Deepgram key from edge function
      const { data: keyData, error: keyErr } = await supabase.functions.invoke('deepgram-token');
      if (keyErr || !keyData?.key) {
        throw new Error('Failed to get Deepgram API key');
      }

      const dgKey = keyData.key;

      // Open WebSocket to Deepgram
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=pt-BR&punctuate=true&interim_results=true&endpointing=300`,
        ['token', dgKey]
      );

      wsRef.current = ws;
      streamRef.current = audioStream;

      ws.onopen = () => {
        setIsTranscribing(true);

        // Start recording audio and sending to Deepgram
        const mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };

        mediaRecorder.start(250); // Send chunks every 250ms
      };

      ws.onmessage = async (event) => {
        try {
          const result = JSON.parse(event.data);
          const transcript = result.channel?.alternatives?.[0]?.transcript;

          if (!transcript) return;

          const isFinal = result.is_final;

          if (isFinal && transcript.trim()) {
            setInterimText('');
            // Save final transcript to database
            await supabase.from('meeting_transcripts').insert({
              meeting_id: meetingId,
              participant_id: participantId,
              participant_name: participantName,
              text: transcript.trim(),
              is_final: true,
            });
          } else if (transcript.trim()) {
            setInterimText(transcript);
          }
        } catch {
          // Ignore parse errors from non-JSON messages
        }
      };

      ws.onerror = () => {
        setError('Transcription connection error');
        setIsTranscribing(false);
      };

      ws.onclose = () => {
        setIsTranscribing(false);
      };
    } catch (err: any) {
      setError(err.message || 'Failed to start transcription');
      setIsTranscribing(false);
    }
  }, [meetingId, participantId, participantName]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    setIsTranscribing(false);
    setInterimText('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isTranscribing,
    interimText,
    error,
    start,
    stop,
  };
}
