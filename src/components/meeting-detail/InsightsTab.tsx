import type { LucideIcon } from 'lucide-react';
import { mensagemDeErro } from '@/lib/errors';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInMinutes } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Loader2, Sparkles, Clock, Users, MessageSquare, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tables } from '@/integrations/supabase/types';

type Meeting = Tables<'meetings'>;

const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#ef4444'];

export function InsightsTab({ meeting }: { meeting: Meeting }) {
  const { toast } = useToast();
  const [generatingAI, setGeneratingAI] = useState(false);

  const { data: transcripts = [] } = useQuery({
    queryKey: ['transcripts', meeting.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('meeting_transcripts')
        .select('*')
        .eq('meeting_id', meeting.id)
        .eq('is_final', true)
        .order('timestamp', { ascending: true });
      return data ?? [];
    },
  });

  const { data: aiInsights, refetch: refetchInsights } = useQuery({
    queryKey: ['insights', meeting.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('briefings')
        .select('content_md')
        .eq('meeting_id', meeting.id)
        .eq('type', 'insights')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.content_md ? JSON.parse(data.content_md) : null;
    },
  });

  // Compute stats
  const duration = meeting.ends_at
    ? differenceInMinutes(new Date(meeting.ends_at), new Date(meeting.starts_at))
    : null;

  const speakers = [...new Set(transcripts.map((t) => t.participant_name))];
  const totalWords = transcripts.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);

  const talkTimeData = speakers.map((name) => {
    const words = transcripts
      .filter((t) => t.participant_name === name)
      .reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
    return { name: name || 'Desconhecido', words };
  });

  const pieData = talkTimeData.map((d) => ({
    name: d.name,
    value: d.words,
  }));

  const generateAIInsights = async () => {
    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { meeting_id: meeting.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Insights gerados!' });
      refetchInsights();
    } catch (err) {
      toast({ title: 'Erro ao gerar insights', description: mensagemDeErro(err), variant: 'destructive' });
    } finally {
      setGeneratingAI(false);
    }
  };

  if (transcripts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Target className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Insights requerem transcricao da reuniao. Use a sala ao vivo com Deepgram para gerar automaticamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Clock} label="Duracao" value={duration ? `${duration} min` : 'N/A'} />
        <MetricCard icon={Users} label="Participantes" value={String(speakers.length)} />
        <MetricCard icon={MessageSquare} label="Palavras" value={totalWords.toLocaleString('pt-BR')} />
        <MetricCard
          icon={Target}
          label="Efetividade"
          value={aiInsights?.score ? `${aiInsights.score}/10` : '—'}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Palavras por participante</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={talkTimeData} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} palavras`]} />
                <Bar dataKey="words" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuicao de fala</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} palavras`]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Insights com IA
            </CardTitle>
            <Button size="sm" variant="outline" onClick={generateAIInsights} disabled={generatingAI} className="gap-1">
              {generatingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {aiInsights ? 'Regerar' : 'Gerar Insights'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiInsights ? (
            <div className="space-y-4">
              {aiInsights.topics && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Topicos-chave</p>
                  <ul className="space-y-1">
                    {aiInsights.topics.map((t: string, i: number) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-primary mt-1">•</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiInsights.sentiment && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Sentimento geral</p>
                  <p className="text-sm">{aiInsights.sentiment}</p>
                </div>
              )}
              {aiInsights.justification && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Score de efetividade: {aiInsights.score}/10</p>
                  <p className="text-sm">{aiInsights.justification}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clique em "Gerar Insights" para analisar a reuniao com IA.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
