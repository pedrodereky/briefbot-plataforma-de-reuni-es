import type { AudioCaptureOptions, VideoCaptureOptions } from 'livekit-client';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useLocalParticipant, useRoomContext, useParticipants } from '@livekit/components-react';
import { Track, DataPacket_Kind } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Square,
  MessageSquare,
  MessageSquareOff,
  Users,
  Circle,
  Loader2,
  Hand,
  Maximize,
  Minimize,
  PictureInPicture2,
  Settings2,
  ChevronUp,
  Clock,
  Link2,
  Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildJoinLink } from '@/lib/join-link';

interface MeetingControlsProps {
  meetingId: string;
  /** Token do convite. Ausente para convidado — que não distribui convite. */
  joinToken?: string | null;
  isHost: boolean;
  onLeave: () => void;
  showTranscript?: boolean;
  onToggleTranscript?: () => void;
  showParticipants?: boolean;
  onToggleParticipants?: () => void;
  isRecording?: boolean;
  recordingLoading?: boolean;
  onToggleRecording?: () => Promise<void> | void;
  meetingStartedAt?: string | null;
}

export function MeetingControls({
  meetingId,
  joinToken,
  isHost,
  onLeave,
  showTranscript,
  onToggleTranscript,
  showParticipants,
  onToggleParticipants,
  isRecording,
  recordingLoading,
  onToggleRecording,
  meetingStartedAt,
}: MeetingControlsProps) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const participants = useParticipants();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [devices, setDevices] = useState<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({ audio: [], video: [] });

  const isMicEnabled = localParticipant.isMicrophoneEnabled;
  const isCamEnabled = localParticipant.isCameraEnabled;
  const isScreenSharing = localParticipant.isScreenShareEnabled;

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicEnabled);
  const toggleCam = () => localParticipant.setCameraEnabled(!isCamEnabled);
  const toggleScreenShare = () => localParticipant.setScreenShareEnabled(!isScreenSharing);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    try {
      const videoEl = document.querySelector('vídeo[data-lk-source="camera"]') as HTMLVideoElement;
      if (videoEl) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoEl.requestPictureInPicture();
        }
      }
    } catch {
      // PiP not supported or no video element
    }
  };

  const toggleHandRaise = () => {
    const newState = !handRaised;
    setHandRaised(newState);
    // Broadcast hand raise state to all participants via data channel
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({
      type: 'hand_raise',
      raised: newState,
      identity: localParticipant.identity,
      name: localParticipant.name,
    }));
    localParticipant.publishData(data, { reliable: true });
  };

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audio: allDevices.filter((d) => d.kind === 'audioinput'),
        video: allDevices.filter((d) => d.kind === 'videoinput'),
      });
    } catch {
      // Permission denied
    }
  };

  const switchAudioDevice = async (deviceId: string) => {
    await localParticipant.setMicrophoneEnabled(true, {
      deviceId: { exact: deviceId },
    } satisfies AudioCaptureOptions);
  };

  const switchVideoDevice = async (deviceId: string) => {
    await localParticipant.setCameraEnabled(true, {
      deviceId: { exact: deviceId },
    } satisfies VideoCaptureOptions);
  };

  const handleLeave = () => {
    room.disconnect();
    onLeave();
  };

  const [isEnding, setIsEnding] = useState(false);

  const handleEndMeeting = async () => {
    setIsEnding(true);

    // Stop recording if active
    if (isRecording && onToggleRecording) {
      try {
      await onToggleRecording();
    } catch {
      // O erro já é exibido por quem passou onToggleRecording.
    }
    }

    // Call server-side end-meeting: closes room, generates summary + insights
    try {
      const { data, error } = await supabase.functions.invoke('end-meeting', {
        body: { meeting_id: meetingId },
      });
      if (error) console.error('end-meeting error:', error);
      else console.log('end-meeting result:', data);
    } catch (err) {
      console.error('end-meeting call failed:', err);
    }

    room.disconnect();
    onLeave();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card border-t">
      {/* Left: meeting info */}
      <div className="flex items-center gap-3">
        {isRecording && (
          <Badge variant="destructive" className="gap-1 animate-pulse">
            <Circle className="w-2 h-2 fill-current" />
            REC
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {participants.length} participante{participants.length !== 1 && 's'}
        </span>
      </div>

      {/* Center: main controls */}
      <div className="flex items-center gap-2">
        {/* Mic with device selector */}
        <div className="flex">
          <ControlButton
            active={isMicEnabled}
            onClick={toggleMic}
            icon={isMicEnabled ? Mic : MicOff}
            tooltip={isMicEnabled ? 'Desativar microfone (M)' : 'Ativar microfone (M)'}
            destructive={!isMicEnabled}
          />
          <DeviceDropdown
            onOpen={loadDevices}
            devices={devices.audio}
            onSelect={switchAudioDevice}
            label="Microfone"
          />
        </div>

        {/* Camera with device selector */}
        <div className="flex">
          <ControlButton
            active={isCamEnabled}
            onClick={toggleCam}
            icon={isCamEnabled ? Video : VideoOff}
            tooltip={isCamEnabled ? 'Desativar camera (V)' : 'Ativar camera (V)'}
            destructive={!isCamEnabled}
          />
          <DeviceDropdown
            onOpen={loadDevices}
            devices={devices.video}
            onSelect={switchVideoDevice}
            label="Camera"
          />
        </div>

        {/* Screen share */}
        <ControlButton
          active={isScreenSharing}
          onClick={toggleScreenShare}
          icon={isScreenSharing ? MonitorOff : Monitor}
          tooltip={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          highlight={isScreenSharing}
        />

        {/* Share invite link */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={linkCopied ? 'default' : 'secondary'}
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => {
                const joinUrl = buildJoinLink(meetingId, joinToken);
                if (!joinUrl) return;
                navigator.clipboard.writeText(joinUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
            >
              {linkCopied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{linkCopied ? 'Link copiado!' : 'Copiar link de convite'}</TooltipContent>
        </Tooltip>

        <div className="w-px h-8 bg-border mx-1" />

        {/* Hand raise */}
        <ControlButton
          active={handRaised}
          onClick={toggleHandRaise}
          icon={Hand}
          tooltip={handRaised ? 'Baixar mao' : 'Levantar mao'}
          highlight={handRaised}
        />

        {/* Recording (host only) */}
        {isHost && onToggleRecording && (
          <ControlButton
            active={!!isRecording}
            onClick={onToggleRecording}
            icon={Circle}
            tooltip={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
            destructive={!!isRecording}
            loading={recordingLoading}
            fillIcon={!!isRecording}
          />
        )}

        <div className="w-px h-8 bg-border mx-1" />

        {/* Panels */}
        {onToggleTranscript && (
          <ControlButton
            active={!!showTranscript}
            onClick={onToggleTranscript}
            icon={showTranscript ? MessageSquare : MessageSquareOff}
            tooltip={showTranscript ? 'Ocultar transcrição' : 'Mostrar transcrição'}
            highlight={!!showTranscript}
          />
        )}

        {onToggleParticipants && (
          <ControlButton
            active={!!showParticipants}
            onClick={onToggleParticipants}
            icon={Users}
            tooltip={showParticipants ? 'Ocultar participantes' : 'Mostrar participantes'}
            highlight={!!showParticipants}
          />
        )}

        <div className="w-px h-8 bg-border mx-1" />

        {/* Utilities */}
        <ControlButton
          active={false}
          onClick={togglePiP}
          icon={PictureInPicture2}
          tooltip="Picture-in-Picture"
        />

        <ControlButton
          active={isFullscreen}
          onClick={toggleFullscreen}
          icon={isFullscreen ? Minimize : Maximize}
          tooltip={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia (F)'}
        />

        <div className="w-px h-8 bg-border mx-1" />

        {/* Leave / End */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="icon" onClick={handleLeave} className="h-10 w-10 rounded-full">
              <PhoneOff className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sair da reunião</TooltipContent>
        </Tooltip>

        {isHost && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="destructive" onClick={handleEndMeeting} disabled={isEnding} className="gap-2 rounded-full">
                {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {isEnding ? 'Encerrando...' : 'Encerrar'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Encerrar reunião para todos</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Right: spacer for balance */}
      <div className="w-[100px]" />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function ControlButton({
  active,
  onClick,
  icon: Icon,
  tooltip,
  destructive,
  highlight,
  loading,
  fillIcon,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  tooltip: string;
  destructive?: boolean;
  highlight?: boolean;
  loading?: boolean;
  fillIcon?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={destructive ? 'destructive' : highlight ? 'default' : 'secondary'}
          size="icon"
          onClick={onClick}
          disabled={loading}
          className="h-10 w-10 rounded-full"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Icon className={`w-5 h-5 ${fillIcon ? 'fill-current' : ''}`} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function DeviceDropdown({
  onOpen,
  devices,
  onSelect,
  label,
}: {
  onOpen: () => void;
  devices: MediaDeviceInfo[];
  onSelect: (deviceId: string) => void;
  label: string;
}) {
  return (
    <DropdownMenu onOpenChange={(open) => open && onOpen()}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="h-10 w-5 rounded-full rounded-l-none -ml-1 border-l border-border/50">
          <ChevronUp className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {devices.length === 0 ? (
          <DropdownMenuItem disabled>Nenhum dispositivo encontrado</DropdownMenuItem>
        ) : (
          devices.map((d) => (
            <DropdownMenuItem key={d.deviceId} onClick={() => onSelect(d.deviceId)}>
              {d.label || `${label} ${d.deviceId.slice(0, 8)}`}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
