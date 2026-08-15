import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Video, Clock, Users, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function RecordingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['recordings', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, title, starts_at, ends_at, attendees, meeting_status')
        .eq('user_id', user!.id)
        .eq('meeting_status', 'ended')
        .order('starts_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Gravacoes</h1>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gravacoes</h1>
      <p className="text-sm text-muted-foreground">
        Todas as reunioes gravadas ficam disponiveis aqui para assistir novamente.
      </p>

      {recordings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Video className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma gravacao ainda. Inicie a gravacao durante uma reuniao ao vivo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((r) => {
            const attendees = Array.isArray(r.attendees) ? r.attendees : [];
            return (
              <Card
                key={r.id}
                className="cursor-pointer hover:bg-accent/30 transition-colors overflow-hidden"
                onClick={() => navigate(`/meetings/${r.id}`)}
              >
                {/* Video thumbnail / play overlay */}
                <div className="relative aspect-video bg-muted flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <Play className="h-10 w-10 text-white/80" />
                  <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                    <Video className="h-3 w-3 mr-1" /> REC
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium text-sm truncate">{r.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(r.starts_at), "dd MMM yyyy", { locale: ptBR })}
                    </span>
                    {(
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {attendees.length + 1}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
