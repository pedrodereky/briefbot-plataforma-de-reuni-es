import { useParticipants } from '@livekit/components-react';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Video, VideoOff, Users } from 'lucide-react';
import { PainelDaSala } from './PainelDaSala';

export function ParticipantList({ onFechar }: { onFechar?: () => void }) {
  const participants = useParticipants();

  return (
    <PainelDaSala
      titulo={`Participantes (${participants.length})`}
      icone={Users}
      onFechar={onFechar}
    >
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {participants.map((p) => (
          <div
            key={p.identity}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {(p.name || p.identity || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{p.name || p.identity}</p>
                {p.identity.startsWith('guest-') && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    Convidado
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-1">
              {p.isMicrophoneEnabled ? (
                <Mic className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <MicOff className="w-3.5 h-3.5 text-destructive" />
              )}
              {p.isCameraEnabled ? (
                <Video className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <VideoOff className="w-3.5 h-3.5 text-destructive" />
              )}
            </div>
          </div>
        ))}
      </div>
    </PainelDaSala>
  );
}
