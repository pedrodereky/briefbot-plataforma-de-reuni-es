import type { Json } from '@/integrations/supabase/types';
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, VideoOff, Mic, MicOff, Users, FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

interface LobbyViewProps {
  meeting: {
    id: string;
    title: string;
    starts_at: string;
    attendees: Json;
    organizer: string | null;
    description: string | null;
  };
  briefingContent?: string | null;
  isHost: boolean;
  isConnecting: boolean;
  onStart: () => void;
}

export function LobbyView({
  meeting,
  briefingContent,
  isHost,
  isConnecting,
  onStart,
}: LobbyViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const initPreview = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        currentStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch {
        // User denied permission or no devices
      }
    };

    initPreview();

    return () => {
      currentStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setVideoEnabled((v) => !v);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setAudioEnabled((a) => !a);
    }
  };

  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];

  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-background">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/meetings/${meeting.id}`)}
        className="absolute top-4 left-4 gap-1 z-10"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      {/* Left: Camera Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
        <h1 className="text-2xl font-bold">{meeting.title}</h1>

        <div className="relative w-full max-w-lg aspect-video bg-muted rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
          />
          {!videoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <VideoOff className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            variant={audioEnabled ? 'secondary' : 'destructive'}
            size="icon"
            onClick={toggleAudio}
          >
            {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>
          <Button
            variant={videoEnabled ? 'secondary' : 'destructive'}
            size="icon"
            onClick={toggleVideo}
          >
            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>
        </div>

        {isHost ? (
          <Button size="lg" onClick={onStart} disabled={isConnecting} className="min-w-[200px]">
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Conectando...
              </>
            ) : (
              'Iniciar Reuniao'
            )}
          </Button>
        ) : (
          <div className="text-center">
            <Badge variant="outline" className="text-base px-4 py-2">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Aguardando o host iniciar...
            </Badge>
          </div>
        )}
      </div>

      {/* Right: Briefing + Participants */}
      <div className="w-[400px] border-l bg-card overflow-y-auto p-6 flex flex-col gap-4">
        {/* Participants */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participantes ({attendees.length + 1})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">Host</Badge>
              <span className="text-sm">{meeting.organizer || 'Organizador'}</span>
            </div>
            {attendees.map((email: string, i: number) => (
              <div key={i} className="text-sm text-muted-foreground">
                {email}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Briefing */}
        {briefingContent && (
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Briefing Pre-Reuniao
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{briefingContent}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
