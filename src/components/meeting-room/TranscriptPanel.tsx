import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';
import { type TranscriptEntry } from '@/hooks/useRealtimeTranscripts';
import { PainelDaSala } from './PainelDaSala';

interface TranscriptPanelProps {
  transcripts: TranscriptEntry[];
  interimText?: string;
  interimSpeaker?: string;
  onFechar?: () => void;
}

export function TranscriptPanel({
  transcripts,
  interimText,
  interimSpeaker,
  onFechar,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, interimText]);

  return (
    <PainelDaSala titulo="Transcrição ao vivo" icone={FileText} onFechar={onFechar}>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {transcripts.length === 0 && !interimText && (
            <p className="text-sm text-muted-foreground text-center py-8">
              A transcrição aparecerá aqui quando alguém começar a falar...
            </p>
          )}

          {transcripts.map((t) => (
            <div key={t.id} className="space-y-0.5">
              <span className="text-xs font-medium text-primary">
                {t.participant_name}
              </span>
              <p className="text-sm text-foreground">{t.text}</p>
            </div>
          ))}

          {/* Interim (live) text */}
          {interimText && (
            <div className="space-y-0.5 opacity-60">
              <span className="text-xs font-medium text-primary">
                {interimSpeaker || '...'}
              </span>
              <p className="text-sm italic">{interimText}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </PainelDaSala>
  );
}
