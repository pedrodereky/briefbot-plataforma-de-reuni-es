import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';
import { type TranscriptEntry } from '@/hooks/useRealtimeTranscripts';

interface TranscriptPanelProps {
  transcripts: TranscriptEntry[];
  interimText?: string;
  interimSpeaker?: string;
}

export function TranscriptPanel({
  transcripts,
  interimText,
  interimSpeaker,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, interimText]);

  return (
    <div className="w-[320px] border-l bg-card flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <FileText className="w-4 h-4" />
        <span className="text-sm font-medium">Transcricao ao Vivo</span>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {transcripts.length === 0 && !interimText && (
            <p className="text-sm text-muted-foreground text-center py-8">
              A transcricao aparecera aqui quando alguem comecar a falar...
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
    </div>
  );
}
