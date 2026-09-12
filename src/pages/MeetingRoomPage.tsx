import { mensagemDeErro } from '@/lib/errors';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { useTemaTravado } from '@/contexts/ThemeProvider';
import { useLiveKit } from '@/hooks/useLiveKit';
import { useTranscription } from '@/hooks/useTranscription';
import { useRealtimeTranscripts } from '@/hooks/useRealtimeTranscripts';
import { useRealtimeMeetingStatus } from '@/hooks/useRealtimeMeetingStatus';
import { useRealtimeActionDetection } from '@/hooks/useRealtimeActionDetection';
import { LobbyView } from '@/components/meeting-room/LobbyView';
import { VideoGrid } from '@/components/meeting-room/VideoGrid';
import { MeetingControls } from '@/components/meeting-room/MeetingControls';
import { TranscriptPanel } from '@/components/meeting-room/TranscriptPanel';
import { ParticipantList } from '@/components/meeting-room/ParticipantList';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function MeetingRoomPage() {
  // Vídeo pede fundo escuro ao redor, como Meet e Zoom fazem: esta é a
  // única rota que ignora a preferência de tema do usuário.
  useTemaTravado('escuro');

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showTranscript, setShowTranscript] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'm': document.querySelector<HTMLButtonElement>('[data-control="mic"]')?.click(); break;
        case 'v': document.querySelector<HTMLButtonElement>('[data-control="cam"]')?.click(); break;
        case 'f': document.querySelector<HTMLButtonElement>('[data-control="fullscreen"]')?.click(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { connection, isConnecting, error: lkError, fetchToken, disconnect } = useLiveKit(id!);
  const meetingStatus = useRealtimeMeetingStatus(id);
  const transcripts = useRealtimeTranscripts(id);
  const { detectedItems, isDetecting } = useRealtimeActionDetection(id, !!connection);

  // Fetch meeting data
  const { data: meeting, isLoading: meetingLoading } = useQuery({
    queryKey: ['meeting', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch briefing
  const { data: briefing } = useQuery({
    queryKey: ['briefings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('briefings')
        .select('content_md')
        .eq('meeting_id', id!)
        .eq('type', 'pre')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const isHost = meeting?.user_id === user?.id;

  // Transcription hook
  const {
    isTranscribing,
    interimText,
    start: startTranscription,
    stop: stopTranscription,
  } = useTranscription({
    meetingId: id!,
    participantId: connection?.identity || user?.id || '',
    participantName: connection?.participant_name || user?.email || '',
    enabled: !!connection,
  });

  // Auto-start recording when connected (non-blocking — meeting works without it)
  const recordingAttempted = useState(false);
  useEffect(() => {
    if (connection && isHost && !isRecording && !recordingLoading && !recordingAttempted[0]) {
      recordingAttempted[1](true);
      const timer = setTimeout(async () => {
        try {
          await toggleRecording();
        } catch {
          // Recording failed (likely free plan) — meeting continues normally
          console.log('Auto-recording not available, continuing without it');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [connection, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start meeting (host action)
  const handleStart = useCallback(async () => {
    try {
      await supabase
        .from('meetings')
        .update({ meeting_status: 'lobby' })
        .eq('id', id!);

      await fetchToken();

      // Start transcription with local audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startTranscription(stream);
      } catch {
        // Transcription optional
      }
    } catch {
      // Error handled by useLiveKit hook
    }
  }, [id, fetchToken, startTranscription]);

  // When meeting goes live and participant is not yet connected, auto-connect
  useEffect(() => {
    if (meetingStatus === 'live' && !connection && !isHost && !isConnecting) {
      fetchToken().then(() => {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          startTranscription(stream);
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [meetingStatus, connection, isHost, isConnecting, fetchToken, startTranscription]);

  const handleLeave = () => {
    stopTranscription();
    disconnect();
    navigate(`/meetings/${id}`);
  };

  const toggleRecording = async () => {
    setRecordingLoading(true);
    try {
      const action = isRecording ? 'stop' : 'start';
      const { data, error } = await supabase.functions.invoke('manage-recording', {
        body: { meeting_id: id, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setIsRecording(action === 'start');
      toast({
        title: action === 'start' ? 'Gravação iniciada' : 'Gravação finalizada',
      });
    } catch (err) {
      toast({ title: 'Erro na gravação', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setRecordingLoading(false);
    }
  };

  // Meeting ended - show end screen
  if (meetingStatus === 'ended' && !connection) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <h1 className="text-2xl font-bold">Reunião Encerrada</h1>
        <p className="text-muted-foreground">
          O resumo esta sendo gerado automaticamente...
        </p>
        <Button onClick={() => navigate(`/meetings/${id}`)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Ver Detalhes da Reunião
        </Button>
      </div>
    );
  }

  // Loading
  if (meetingLoading) {
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
        <Button onClick={() => navigate('/meetings')} variant="outline">
          Voltar
        </Button>
      </div>
    );
  }

  // Lobby state - not yet connected to LiveKit
  if (!connection) {
    return (
      <LobbyView
        meeting={meeting}
        briefingContent={briefing?.content_md}
        isHost={isHost}
        isConnecting={isConnecting}
        onStart={handleStart}
      />
    );
  }

  // Live state - connected to LiveKit
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

        {showParticipants && <ParticipantList onFechar={() => setShowParticipants(false)} />}

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
        joinToken={meeting?.join_token}
        isHost={isHost}
        onLeave={handleLeave}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        showParticipants={showParticipants}
        onToggleParticipants={() => setShowParticipants((v) => !v)}
        isRecording={isRecording}
        recordingLoading={recordingLoading}
        onToggleRecording={toggleRecording}
      />
    </LiveKitRoom>
  );
}
