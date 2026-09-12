import { useState, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { supabase } from '@/integrations/supabase/client';
import { useTemaTravado } from '@/contexts/ThemeProvider';
import { useLiveKit } from '@/hooks/useLiveKit';
import { useTranscription } from '@/hooks/useTranscription';
import { useRealtimeTranscripts } from '@/hooks/useRealtimeTranscripts';
import { useRealtimeMeetingStatus } from '@/hooks/useRealtimeMeetingStatus';
import { VideoGrid } from '@/components/meeting-room/VideoGrid';
import { MeetingControls } from '@/components/meeting-room/MeetingControls';
import { TranscriptPanel } from '@/components/meeting-room/TranscriptPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Users, ArrowLeft } from 'lucide-react';
import { readJoinToken } from '@/lib/join-link';

export default function JoinMeetingPage() {
  // Vídeo pede fundo escuro ao redor, como Meet e Zoom fazem: esta é a
  // única rota que ignora a preferência de tema do usuário.
  useTemaTravado('escuro');

  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  // O link de convite carrega o segredo da reunião; sem ele o servidor recusa
  // a entrada (auditoria P0 item 3).
  const joinToken = readJoinToken(search);
  const [guestName, setGuestName] = useState('');
  const [showTranscript, setShowTranscript] = useState(true);

  const { connection, isConnecting, error: lkError, fetchToken, disconnect } = useLiveKit(id!);
  const meetingStatus = useRealtimeMeetingStatus(id);
  const transcripts = useRealtimeTranscripts(id);

  // Fetch meeting info (public - minimal data)
  const { data: meeting, isLoading } = useQuery({
    queryKey: ['meeting-public', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, starts_at, meeting_status')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!id,
  });

  const {
    isTranscribing,
    interimText,
    start: startTranscription,
    stop: stopTranscription,
  } = useTranscription({
    meetingId: id!,
    participantId: connection?.identity || '',
    participantName: connection?.participant_name || guestName,
    joinToken,
    enabled: !!connection,
  });

  const handleJoin = useCallback(async () => {
    if (!guestName.trim()) return;

    try {
      await fetchToken(guestName.trim(), joinToken);

      // Start transcription
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startTranscription(stream);
      } catch {
        // Continue without transcription
      }
    } catch {
      // Error handled by hook
    }
  }, [guestName, joinToken, fetchToken, startTranscription]);

  const handleLeave = () => {
    stopTranscription();
    disconnect();
  };

  if (meetingStatus === 'ended') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <h1 className="text-2xl font-bold">Reunião Encerrada</h1>
        <p className="text-muted-foreground">
          Esta reunião já foi finalizada.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <h1 className="text-xl font-bold">Reunião não encontrada</h1>
        <p className="text-muted-foreground">
          Verifique se o link esta correto.
        </p>
      </div>
    );
  }

  // Guest join form
  if (!connection) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Entrar na Reunião
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-lg font-medium">{meeting.title}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(meeting.starts_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <Input
              placeholder="Seu nome"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />

            {lkError && (
              <p className="text-sm text-destructive">{lkError}</p>
            )}

            <Button
              className="w-full"
              onClick={handleJoin}
              disabled={!guestName.trim() || isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connected - show meeting room
  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.livekit_url}
      connect={true}
      audio={true}
      video={true}
      onDisconnected={handleLeave}
      className="h-screen flex flex-col bg-background"
    >
      <RoomAudioRenderer />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <VideoGrid />

        {showTranscript && (
          <TranscriptPanel
            transcripts={transcripts}
            interimText={interimText}
            interimSpeaker={connection.participant_name}
            onFechar={() => setShowTranscript(false)}
          />
        )}
      </div>

      <MeetingControls
        meetingId={id!}
        isHost={false}
        onLeave={handleLeave}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
      />
    </LiveKitRoom>
  );
}
