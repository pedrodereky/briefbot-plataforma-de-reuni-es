import { useQuery } from '@tanstack/react-query';
import { Video, Download, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Aba de gravação.
 *
 * Antes lia `recording_url` e `recording_egress_id` de um `data as any` —
 * colunas que não existiam no schema (auditoria P1 item 9). O `as any` era o
 * que fazia o TypeScript aceitar. Com as colunas criadas na migration da Fase
 * 2, os campos são tipados e cada estado da gravação tem sua própria tela.
 */
export function RecordingTab({ meetingId }: { meetingId: string }) {
  const { data: meeting, isLoading } = useQuery({
    queryKey: ['meeting-recording', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('recording_url, recording_status, recording_started_at')
        .eq('id', meetingId)
        .single();
      if (error) throw error;
      return data;
    },
    // Enquanto processa, o webhook do LiveKit ainda vai preencher a URL.
    refetchInterval: (query) =>
      query.state.data?.recording_status === 'processing' ||
      query.state.data?.recording_status === 'recording'
        ? 15000
        : false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!meeting?.recording_url) {
    const status = meeting?.recording_status;

    const mensagem =
      status === 'recording'
        ? 'Gravação em andamento. O vídeo aparece aqui quando a reunião terminar.'
        : status === 'processing'
          ? 'A gravação está sendo processada. Esta página se atualiza sozinha.'
          : status === 'failed'
            ? 'A gravação falhou. Verifique se o armazenamento está configurado e se seu plano do LiveKit inclui Egress.'
            : 'Nenhuma gravação disponível. Inicie a gravação durante a reunião ao vivo usando o botão de gravar.';

    const Icone =
      status === 'failed' ? AlertTriangle : status === 'processing' ? Loader2 : Video;

    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Icone
            className={`h-10 w-10 ${
              status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            } ${status === 'processing' ? 'animate-spin' : ''}`}
          />
          <p className="text-sm text-muted-foreground text-center max-w-sm">{mensagem}</p>
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
          Seu navegador não suporta o elemento de vídeo.
        </video>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild className="gap-1">
          <a href={meeting.recording_url} download target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5" />
            Baixar gravação
          </a>
        </Button>
      </div>
    </div>
  );
}
