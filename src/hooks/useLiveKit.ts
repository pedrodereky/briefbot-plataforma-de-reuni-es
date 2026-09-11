import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LiveKitConnection {
  token: string;
  room_name: string;
  livekit_url: string;
  identity: string;
  participant_name: string;
  is_host: boolean;
}

export function useLiveKit(meetingId: string) {
  const [connection, setConnection] = useState<LiveKitConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async (guestName?: string, joinToken?: string | null) => {
    setIsConnecting(true);
    setError(null);

    try {
      const body: Record<string, string> = { meeting_id: meetingId };
      if (guestName) {
        body.guest_name = guestName;
      }
      // Sem o token do convite o servidor recusa a entrada de convidado
      // (auditoria P0 item 3). O dono autenticado não precisa dele.
      if (joinToken) {
        body.join_token = joinToken;
      }

      const { data, error: fnError } = await supabase.functions.invoke('livekit-token', {
        body,
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to get LiveKit token');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const conn: LiveKitConnection = {
        token: data.token,
        room_name: data.room_name,
        livekit_url: data.livekit_url,
        identity: data.identity,
        participant_name: data.participant_name,
        is_host: data.is_host,
      };

      setConnection(conn);
      return conn;
    } catch (err: any) {
      const msg = err.message || 'Failed to connect';
      setError(msg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [meetingId]);

  const disconnect = useCallback(() => {
    setConnection(null);
  }, []);

  return {
    connection,
    isConnecting,
    error,
    fetchToken,
    disconnect,
  };
}
