import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const SPEAKER_COLORS = [
  'bg-blue-500/15 text-blue-700',
  'bg-green-500/15 text-green-700',
  'bg-purple-500/15 text-purple-700',
  'bg-orange-500/15 text-orange-700',
  'bg-pink-500/15 text-pink-700',
  'bg-cyan-500/15 text-cyan-700',
  'bg-amber-500/15 text-amber-700',
  'bg-red-500/15 text-red-700',
];

export function TranscriptTab({ meetingId }: { meetingId: string }) {
  const [search, setSearch] = useState('');

  const { data: transcripts = [], isLoading } = useQuery({
    queryKey: ['transcripts', meetingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('meeting_transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('is_final', true)
        .order('timestamp', { ascending: true });
      return data ?? [];
    },
  });

  const speakers = [...new Set(transcripts.map((t) => t.participant_name))];
  const getSpeakerColor = (name: string | null) => {
    const idx = speakers.indexOf(name);
    return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
  };

  const filtered = search.trim()
    ? transcripts.filter((t) => t.text.toLowerCase().includes(search.toLowerCase()))
    : transcripts;

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark> : part
    );
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Carregando transcricao...</div>;
  }

  if (transcripts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Nenhuma transcricao disponivel. Transcricoes sao geradas automaticamente durante reunioes ao vivo com o Deepgram ativado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar na transcricao..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filtered.map((t) => (
          <div key={t.id} className="flex gap-3 py-2">
            <div className="text-[11px] text-muted-foreground whitespace-nowrap pt-0.5 w-12 shrink-0">
              {t.timestamp ? format(new Date(t.timestamp), 'HH:mm:ss') : '--:--'}
            </div>
            <div>
              <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded mb-0.5 ${getSpeakerColor(t.participant_name)}`}>
                {t.participant_name || 'Desconhecido'}
              </span>
              <p className="text-sm">{highlightText(t.text, search)}</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum resultado para "{search}"
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{transcripts.length} segmentos de transcricao</p>
    </div>
  );
}
