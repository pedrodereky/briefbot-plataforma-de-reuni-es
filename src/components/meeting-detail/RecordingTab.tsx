import { useQuery } from '@tanstack/react-query';
import { Video, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function RecordingTab({ meetingId }: { meetingId: string }) {
  const { data: meeting } = useQuery({
    queryKey: ['meeting-recording', meetingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();
      return data as any;
    },
  });

  if (!meeting?.recording_url) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Video className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            {meeting?.recording_egress_id
              ? 'A gravacao esta sendo processada. Atualize a pagina em alguns minutos.'
              : 'Nenhuma gravacao disponivel. Inicie a gravacao durante a reuniao ao vivo usando o botao de gravar.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden bg-black aspect-video">
        <video
          src={meeting.recording_url}
          controls
          className="w-full h-full"
          controlsList="nodownload"
        >
          Seu navegador nao suporta o elemento de video.
        </video>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild className="gap-1">
          <a href={meeting.recording_url} download target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5" />
            Baixar gravacao
          </a>
        </Button>
      </div>
    </div>
  );
}
