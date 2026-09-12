import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, Zap, Plus, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, PageBody } from '@/components/PageHeader';
import { MetricStrip } from '@/components/MetricStrip';
import { EmptyState, EmptyStateCard } from '@/components/states/EmptyState';
import { ListSkeleton } from '@/components/states/ListSkeleton';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type Meeting = Tables<'meetings'>;

/** Só a hora: a linha já está agrupada por dia. */
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaCurto(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function ehHoje(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString();
}

function resumoDoDia(total: number) {
  const data = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  if (total === 0) return `${data} · nenhuma reunião hoje`;
  return `${data} · ${total} ${total === 1 ? 'reunião hoje' : 'reuniões hoje'}`;
}

/**
 * O que a IA já entregou para esta reunião.
 *
 * É a coluna mais à direita de propósito: numa lista de reuniões, "a ata está
 * pronta?" é a pergunta que se responde de relance, e o status da própria
 * reunião ("agendada") quase nunca é notícia.
 */
function EntregaDaIA({ meeting }: { meeting: Meeting }) {
  const passou = new Date(meeting.starts_at) < new Date();

  if (meeting.meeting_status === 'live') {
    return (
      <Badge className="border-live/30 bg-live/15 text-xs text-live hover:bg-live/15">
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-live" aria-hidden="true" />
        ao vivo
      </Badge>
    );
  }
  if (meeting.summary_sent) {
    return <span className="text-xs text-muted-foreground">ata enviada</span>;
  }
  if (meeting.meeting_status === 'ended') {
    return <span className="text-xs text-primary">gerando ata</span>;
  }
  if (passou) {
    return <span className="text-xs text-warning">ata pendente</span>;
  }
  if (meeting.briefing_sent) {
    return (
      <span className="rounded-sm border border-primary/30 px-1.5 py-0.5 text-[11.5px] text-primary">
        briefing pronto
      </span>
    );
  }
  return <span className="tabular font-mono text-[11.5px] text-muted-foreground">sem briefing</span>;
}

function LinhaDeReuniao({ meeting, mostrarDia }: { meeting: Meeting; mostrarDia?: boolean }) {
  const navigate = useNavigate();
  const participantes = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : [];
  const nomes = participantes.map((e) => e.split('@')[0]);
  const visiveis = nomes.slice(0, 3).join(', ');
  const extras = nomes.length - 3;

  return (
    <button
      type="button"
      onClick={() => navigate(`/meetings/${meeting.id}`)}
      className="flex w-full flex-col gap-1 bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
    >
      {/* No celular horário e entrega dividem a primeira linha, e o título fica
          com a largura toda embaixo. Lado a lado, o selo comia o título: sobrava
          "Alinhamento ..." */}
      <span className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <span className="tabular min-w-[44px] shrink-0 font-mono text-[13px] text-foreground">
          {mostrarDia && !ehHoje(meeting.starts_at) ? diaCurto(meeting.starts_at) : hora(meeting.starts_at)}
        </span>
        <span className="shrink-0 sm:hidden">
          <EntregaDaIA meeting={meeting} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{meeting.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {nomes.length > 0 ? (
            <>
              {visiveis}
              {extras > 0 && ` +${extras}`}
            </>
          ) : (
            'sem participantes'
          )}
        </span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <EntregaDaIA meeting={meeting} />
      </span>
    </button>
  );
}

/** Quanto falta, em palavras curtas. Passou da hora, diz que começou. */
function faltam(iso: string): string {
  const minutos = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutos < -90) return 'já passou';
  if (minutos < 0) return 'começou';
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `em ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `em ${horas} h`;
  return 'depois';
}

/**
 * A próxima reunião como cartão, só no celular.
 *
 * Na tela do telefone a pergunta é "e agora?", e a resposta estava diluída
 * numa linha de lista igual a todas as outras. Aqui ela ganha o topo, com a
 * ação principal em alvo de toque cheio. No desktop o cartão some: lá a lista
 * inteira cabe de uma vez e repetir a primeira linha seria ruído.
 */
function ProximaReuniao({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const participantes = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : [];
  const nomes = participantes.map((e) => e.split('@')[0]);
  const aoVivo = meeting.meeting_status === 'live';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4 sm:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-primary">
          {aoVivo ? 'acontecendo agora' : faltam(meeting.starts_at)}
        </span>
        <EntregaDaIA meeting={meeting} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold leading-snug text-foreground">{meeting.title}</span>
        <span className="text-[13px] text-muted-foreground">
          {hora(meeting.starts_at)}
          {nomes.length > 0 && ` · ${nomes.slice(0, 3).join(', ')}`}
          {nomes.length > 3 && ` +${nomes.length - 3}`}
        </span>
      </div>

      <div className="mt-0.5 flex gap-2">
        <Button className="h-11 flex-1" onClick={() => navigate(`/meetings/${meeting.id}/room`)}>
          Entrar
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={() => navigate(`/meetings/${meeting.id}`)}
        >
          Ver briefing
        </Button>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Lista({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-border overflow-hidden rounded-lg border border-border',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { metrics, upcoming, recent, isLoading } = useDashboardData();
  const { createInstant, creating } = useCreateInstantMeeting();
  const [createOpen, setCreateOpen] = useState(false);

  const hoje = [...upcoming, ...recent].filter((m) => ehHoje(m.starts_at)).length;
  const vazio = !isLoading && upcoming.length === 0 && recent.length === 0;

  const metricas = [
    { label: 'Reuniões esta semana', valor: metrics.meetingsThisWeek },
    { label: 'Briefings enviados', valor: metrics.briefingsSent },
    { label: 'Atas geradas', valor: metrics.summariesSent },
    { label: 'Action items abertos', valor: metrics.openActionItems, alerta: true },
  ];

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        resumo={isLoading ? undefined : resumoDoDia(hoje)}
        acoes={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => createInstant()}
              disabled={creating}
              className="gap-1.5"
            >
              <Zap className="h-4 w-4" /> Iniciar agora
            </Button>
            <CreateMeetingDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Nova reunião
                </Button>
              }
            />
          </>
        }
      />

      <MetricStrip metricas={metricas} carregando={isLoading} />

      {vazio ? (
        <EmptyState
          icone={Bot}
          titulo="Nenhuma reunião ainda"
          descricao="Agende a primeira ou inicie uma agora. O copiloto prepara o briefing antes e escreve a ata depois — você não precisa fazer nada durante."
          rodape="A ata chega por e-mail aos participantes assim que a reunião termina."
        >
          <div className="flex flex-wrap justify-center gap-3">
            <EmptyStateCard
              destaque
              icone={Plus}
              titulo="Agendar uma reunião"
              descricao="Título, horário e quem participa. Leva menos de um minuto."
              acao={
                <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
                  Criar reunião
                </Button>
              }
            />
            <EmptyStateCard
              icone={Zap}
              titulo="Começar agora"
              descricao="Abre uma sala na hora e já liga a transcrição."
              acao={
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => createInstant()}
                  disabled={creating}
                >
                  Reunião rápida
                </Button>
              }
            />
          </div>
        </EmptyState>
      ) : (
        <PageBody className="flex flex-col gap-8">
          {!isLoading && upcoming[0] && <ProximaReuniao meeting={upcoming[0]} />}

          <Secao titulo="Próximas reuniões">
            {isLoading ? (
              <ListSkeleton linhas={3} />
            ) : upcoming.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Nada agendado daqui para a frente.
              </p>
            ) : (
              <Lista>
                {upcoming.map((m) => (
                  <LinhaDeReuniao key={m.id} meeting={m} mostrarDia />
                ))}
              </Lista>
            )}
          </Secao>

          <Secao titulo="Reuniões recentes">
            {isLoading ? (
              <ListSkeleton linhas={3} />
            ) : recent.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Nenhuma reunião passada ainda.
              </p>
            ) : (
              <Lista>
                {recent.map((m) => (
                  <LinhaDeReuniao key={m.id} meeting={m} mostrarDia />
                ))}
              </Lista>
            )}
          </Secao>
        </PageBody>
      )}
    </>
  );
}
