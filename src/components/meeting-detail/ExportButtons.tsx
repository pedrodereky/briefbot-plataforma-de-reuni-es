import { buildMarkdown, nomeDoArquivo } from '@/lib/export-markdown';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, FileText, Printer, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tables } from '@/integrations/supabase/types';

type Meeting = Tables<'meetings'>;

interface ExportButtonsProps {
  meeting: Meeting;
  summaryContent: string;
}

export function ExportButtons({ meeting, summaryContent }: ExportButtonsProps) {
  const [loadingMd, setLoadingMd] = useState(false);

  const { data: actionItems = [] } = useQuery({
    queryKey: ['action_items_export', meeting.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('action_items')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  const { data: transcripts = [] } = useQuery({
    queryKey: ['transcripts_export', meeting.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('meeting_transcripts')
        .select('participant_name, text, timestamp')
        .eq('meeting_id', meeting.id)
        .eq('is_final', true)
        .order('timestamp', { ascending: true });
      return data ?? [];
    },
  });

  const downloadMarkdown = () => {
    setLoadingMd(true);
    try {
      const md = buildMarkdown({ meeting, summaryContent, actionItems, transcripts });
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoArquivo(meeting.title, meeting.starts_at);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoadingMd(false);
    }
  };

  const printPDF = () => {
    window.print();
  };

  return (
    <div className="flex gap-2 pt-4 border-t mt-4">
      <Button variant="outline" size="sm" onClick={downloadMarkdown} disabled={loadingMd} className="gap-1">
        {loadingMd ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        Exportar .md
      </Button>
      <Button variant="outline" size="sm" onClick={printPDF} className="gap-1">
        <Printer className="h-3.5 w-3.5" />
        Exportar PDF
      </Button>
    </div>
  );
}
