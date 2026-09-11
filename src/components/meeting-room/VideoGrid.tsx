import type { TrackReference } from '@livekit/components-react';
import { useState, useEffect } from 'react';
import {
  useTracks,
  VideoTrack,
  useParticipants,
  useIsSpeaking,
  useRoomContext,
} from '@livekit/components-react';
import { Track, Participant, RoomEvent } from 'livekit-client';
import { cn } from '@/lib/utils';
import { Hand, Mic, MicOff, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function ParticipantTile({
  participant,
  isPinned,
  onPin,
  isLarge,
  handRaised,
}: {
  participant: Participant;
  isPinned: boolean;
  onPin: () => void;
  isLarge?: boolean;
  handRaised: boolean;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  ).filter((t) => t.participant.identity === participant.identity);

  const videoTrack = tracks.find((t) => t.source === Track.Source.Camera);

  return (
    <div
      className={cn(
        'relative bg-muted rounded-xl overflow-hidden aspect-video group',
        isSpeaking && 'ring-2 ring-primary',
        isPinned && 'ring-2 ring-yellow-400'
      )}
    >
      {videoTrack?.publication?.track ? (
        <VideoTrack
          trackRef={videoTrack as TrackReference}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <div className={cn(
            'rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary',
            isLarge ? 'w-24 h-24 text-4xl' : 'w-16 h-16 text-2xl'
          )}>
            {(participant.name || participant.identity || '?')[0].toUpperCase()}
          </div>
        </div>
      )}

      {/* Hand raised indicator */}
      {handRaised && (
        <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 rounded-full p-1.5 animate-bounce shadow-lg">
          <Hand className="w-4 h-4" />
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {participant.isMicrophoneEnabled === false ? (
            <MicOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-green-400" />
          )}
          <span className="text-white text-xs font-medium truncate max-w-[120px]">
            {participant.name || participant.identity}
          </span>
          {isSpeaking && (
            <span className="flex gap-0.5">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-0.5 bg-green-400 rounded-full animate-pulse"
                  style={{
                    height: `${4 + Math.random() * 8}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </span>
          )}
        </div>

        {/* Pin button — visible on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onPin(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-white/70 hover:text-white"
          title={isPinned ? 'Desafixar' : 'Fixar'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function VideoGrid() {
  const participants = useParticipants();
  const room = useRoomContext();
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const [handRaisedMap, setHandRaisedMap] = useState<Record<string, boolean>>({});

  // Listen for hand raise data messages
  useEffect(() => {
    const handleData = (payload: Uint8Array, participant?: Participant) => {
      try {
        const decoder = new TextDecoder();
        const msg = JSON.parse(decoder.decode(payload));
        if (msg.type === 'hand_raise') {
          setHandRaisedMap((prev) => ({ ...prev, [msg.identity]: msg.raised }));
        }
      } catch {
        // Ignore non-JSON data
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Screen share detection
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const hasScreenShare = screenTracks.length > 0;

  const pinnedParticipant = pinnedIdentity
    ? participants.find((p) => p.identity === pinnedIdentity)
    : null;

  const togglePin = (identity: string) => {
    setPinnedIdentity((prev) => (prev === identity ? null : identity));
  };

  // Pinned or screen share layout — one big + strip of small
  if (pinnedParticipant || hasScreenShare) {
    const otherParticipants = participants.filter(
      (p) => p.identity !== (pinnedParticipant?.identity ?? '')
    );

    return (
      <div className="flex-1 flex flex-col gap-2 p-2">
        {/* Main area */}
        <div className="flex-1 rounded-xl overflow-hidden">
          {hasScreenShare && !pinnedParticipant ? (
            <VideoTrack
              trackRef={screenTracks[0] as TrackReference}
              className="w-full h-full object-contain bg-black rounded-xl"
            />
          ) : pinnedParticipant ? (
            <ParticipantTile
              participant={pinnedParticipant}
              isPinned={true}
              onPin={() => togglePin(pinnedParticipant.identity)}
              isLarge
              handRaised={!!handRaisedMap[pinnedParticipant.identity]}
            />
          ) : null}
        </div>
        {/* Bottom strip */}
        <div className="flex gap-2 h-[120px] overflow-x-auto shrink-0">
          {(pinnedParticipant ? otherParticipants : participants).map((p) => (
            <div key={p.identity} className="w-[180px] flex-shrink-0">
              <ParticipantTile
                participant={p}
                isPinned={false}
                onPin={() => togglePin(p.identity)}
                handRaised={!!handRaisedMap[p.identity]}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Grid layout
  const gridClass = () => {
    const count = participants.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  return (
    <div className={cn('flex-1 grid gap-2 p-2 auto-rows-fr', gridClass())}>
      {participants.map((p) => (
        <ParticipantTile
          key={p.identity}
          participant={p}
          isPinned={pinnedIdentity === p.identity}
          onPin={() => togglePin(p.identity)}
          handRaised={!!handRaisedMap[p.identity]}
        />
      ))}
    </div>
  );
}
