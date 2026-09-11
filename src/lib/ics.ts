/**
 * Geração de convite de calendário (.ics).
 *
 * O produto tem uma página de calendário e um campo `calendar_event_id`, mas
 * nunca houve integração nenhuma: o campo é preenchido com `crypto.randomUUID()`
 * (auditoria P1 item 13). O participante recebia o e-mail de convite e não
 * tinha como colocar a reunião na agenda dele.
 *
 * Esta é a opção barata que cobre a maior parte do valor: um arquivo .ics
 * padrão (RFC 5545), que Google Agenda, Outlook, Apple Calendar e praticamente
 * qualquer cliente sabem importar — sem OAuth, sem sincronização bidirecional
 * e sem guardar credencial de calendário de ninguém.
 */

export interface EventoICS {
  uid: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  description?: string | null;
  organizer?: string | null;
  attendees?: string[];
  /** Link da sala; entra como localização do evento. */
  joinUrl?: string | null;
}

/** Formato de data do iCalendar, em UTC: 20260305T143000Z */
function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) throw new Error('Data invalida para o evento');
  return `${data.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Escapa conforme a RFC 5545: vírgula, ponto e vírgula, barra invertida e
 * quebra de linha têm significado no formato e quebrariam o arquivo.
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Dobra linhas em 75 octetos, como exige a RFC — cliente rígido rejeita o
 * arquivo inteiro quando uma linha passa disso.
 */
function dobrarLinha(linha: string): string {
  if (linha.length <= 75) return linha;
  const partes: string[] = [linha.slice(0, 75)];
  let resto = linha.slice(75);
  while (resto.length > 74) {
    partes.push(` ${resto.slice(0, 74)}`);
    resto = resto.slice(74);
  }
  if (resto) partes.push(` ${resto}`);
  return partes.join('\r\n');
}

export function buildICS(evento: EventoICS): string {
  const inicio = formatarData(evento.startsAt);
  const fim = evento.endsAt
    ? formatarData(evento.endsAt)
    : formatarData(new Date(new Date(evento.startsAt).getTime() + 60 * 60 * 1000).toISOString());

  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BriefBot//Reunioes//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${evento.uid}`,
    `DTSTAMP:${formatarData(new Date().toISOString())}`,
    `DTSTART:${inicio}`,
    `DTEND:${fim}`,
    `SUMMARY:${escapar(evento.title)}`,
  ];

  if (evento.description) linhas.push(`DESCRIPTION:${escapar(evento.description)}`);
  if (evento.joinUrl) {
    linhas.push(`LOCATION:${escapar(evento.joinUrl)}`);
    linhas.push(`URL:${escapar(evento.joinUrl)}`);
  }
  if (evento.organizer) linhas.push(`ORGANIZER;CN=${escapar(evento.organizer)}:mailto:${evento.organizer}`);
  for (const participante of evento.attendees ?? []) {
    linhas.push(`ATTENDEE;CN=${escapar(participante)};RSVP=TRUE:mailto:${participante}`);
  }

  linhas.push('END:VEVENT', 'END:VCALENDAR');

  // CRLF é obrigatório na RFC; alguns clientes recusam LF puro.
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
}

export function nomeArquivoICS(title: string): string {
  const slug =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'reuniao';
  return `${slug}.ics`;
}

// ─── Detecção de conflito de horário ────────────────────────────────────────

export interface JanelaReuniao {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
}

const DURACAO_PADRAO_MIN = 60;

function janela(reuniao: JanelaReuniao): [number, number] {
  const inicio = new Date(reuniao.starts_at).getTime();
  const fim = reuniao.ends_at
    ? new Date(reuniao.ends_at).getTime()
    : inicio + DURACAO_PADRAO_MIN * 60 * 1000;
  return [inicio, fim];
}

/**
 * Reuniões que se sobrepõem à candidata.
 *
 * Encostar não é conflito: uma reunião que termina 14h e outra que começa 14h
 * convivem. Por isso a comparação é estritamente de sobreposição.
 */
export function encontrarConflitos(
  candidata: JanelaReuniao,
  existentes: JanelaReuniao[],
): JanelaReuniao[] {
  const [inicioA, fimA] = janela(candidata);
  if (Number.isNaN(inicioA)) return [];

  return existentes.filter((outra) => {
    if (outra.id === candidata.id) return false;
    const [inicioB, fimB] = janela(outra);
    if (Number.isNaN(inicioB)) return false;
    return inicioA < fimB && inicioB < fimA;
  });
}
