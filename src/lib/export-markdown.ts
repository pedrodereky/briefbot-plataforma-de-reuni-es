import { format } from 'date-fns';

/**
 * Montagem da ata em Markdown.
 *
 * Estava embutida no componente `ExportButtons`, onde não dava para testar
 * (auditoria P2 item 16). É o artefato que o usuário leva para fora do
 * produto — vale garantir que não quebra com dados faltando.
 */

export interface ReuniaoParaExportar {
  title: string;
  starts_at: string;
  organizer?: string | null;
  attendees?: unknown;
}

export interface ActionItemParaExportar {
  owner: string;
  task: string;
  due_date?: string | null;
  done?: boolean | null;
}

export interface TrechoParaExportar {
  participant_name?: string | null;
  text: string;
  timestamp?: string | null;
}

interface Entrada {
  meeting: ReuniaoParaExportar;
  summaryContent: string;
  actionItems?: ActionItemParaExportar[];
  transcripts?: TrechoParaExportar[];
}

/** `attendees` é jsonb: pode vir como array, null, ou qualquer outra coisa. */
function lerParticipantes(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  return attendees.filter((item): item is string => typeof item === 'string');
}

function formatarData(iso: string, padrao: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return format(data, padrao);
}

export function buildMarkdown({
  meeting,
  summaryContent,
  actionItems = [],
  transcripts = [],
}: Entrada): string {
  const participantes = lerParticipantes(meeting.attendees);
  const dataStr = formatarData(meeting.starts_at, 'dd/MM/yyyy HH:mm');

  let md = `# ${meeting.title}\n\n`;
  if (dataStr) md += `**Data:** ${dataStr}\n`;
  if (meeting.organizer) md += `**Organizador:** ${meeting.organizer}\n`;
  if (participantes.length > 0) md += `**Participantes:** ${participantes.join(', ')}\n`;
  md += `\n---\n\n`;

  md += `## Resumo\n\n${summaryContent}\n\n`;

  if (actionItems.length > 0) {
    md += `## Action Items\n\n`;
    for (const item of actionItems) {
      const status = item.done ? '[x]' : '[ ]';
      md += `- ${status} **${item.owner}**: ${item.task}`;
      if (item.due_date) md += ` (prazo: ${item.due_date})`;
      md += `\n`;
    }
    md += `\n`;
  }

  if (transcripts.length > 0) {
    md += `## Transcrição\n\n`;
    for (const trecho of transcripts) {
      const hora = trecho.timestamp ? formatarData(trecho.timestamp, 'HH:mm:ss') : '';
      const quem = trecho.participant_name || 'Participante';
      md += `**${quem}** ${hora ? `[${hora}]` : ''}: ${trecho.text}\n\n`;
    }
  }

  return md;
}

/** Nome de arquivo seguro para a ata. */
export function nomeDoArquivo(title: string, startsAt: string): string {
  const slug =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'reuniao';

  const data = formatarData(startsAt, 'yyyy-MM-dd') || 'sem-data';
  return `ata-${slug}-${data}.md`;
}
