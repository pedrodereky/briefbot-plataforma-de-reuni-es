import { describe, it, expect } from "vitest";
import { buildICS, nomeArquivoICS, encontrarConflitos } from "@/lib/ics";

const BASE = {
  uid: "22222222-2222-2222-2222-222222222222",
  title: "Alinhamento semanal",
  startsAt: "2026-03-05T14:30:00.000Z",
  endsAt: "2026-03-05T15:30:00.000Z",
};

function linhas(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildICS", () => {
  it("produz um calendário válido, com abertura e fechamento", () => {
    const ics = buildICS(BASE);
    expect(linhas(ics)[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("usa CRLF, como a RFC exige", () => {
    // Cliente rígido recusa o arquivo inteiro com LF puro.
    const ics = buildICS(BASE);
    expect(ics).toContain("\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("formata as datas em UTC no formato do iCalendar", () => {
    const ics = buildICS(BASE);
    expect(ics).toContain("DTSTART:20260305T143000Z");
    expect(ics).toContain("DTEND:20260305T153000Z");
  });

  it("assume uma hora de duração quando não há término", () => {
    const ics = buildICS({ ...BASE, endsAt: null });
    expect(ics).toContain("DTSTART:20260305T143000Z");
    expect(ics).toContain("DTEND:20260305T153000Z");
  });

  it("leva o id da reunião como UID", () => {
    expect(buildICS(BASE)).toContain(`UID:${BASE.uid}`);
  });

  it("escapa vírgula, ponto e vírgula e barra invertida no título", () => {
    // Sem escapar, o cliente interpreta como separador e o evento se perde.
    const ics = buildICS({ ...BASE, title: "Reunião: vendas, produto; e TI \\ resto" });
    expect(ics).toContain("SUMMARY:Reunião: vendas\\, produto\\; e TI \\\\ resto");
  });

  it("transforma quebra de linha da descrição em \\n literal", () => {
    const ics = buildICS({ ...BASE, description: "Primeira linha\nSegunda linha" });
    expect(ics).toContain("DESCRIPTION:Primeira linha\\nSegunda linha");
    // A quebra não pode virar uma linha nova de verdade no arquivo.
    expect(linhas(ics).some((l) => l === "Segunda linha")).toBe(false);
  });

  it("inclui o link da sala como localização e URL", () => {
    const ics = buildICS({ ...BASE, joinUrl: "https://app.exemplo.com/join/abc?t=xyz" });
    expect(ics).toContain("LOCATION:https://app.exemplo.com/join/abc?t=xyz");
    expect(ics).toContain("URL:https://app.exemplo.com/join/abc?t=xyz");
  });

  it("lista organizador e participantes", () => {
    const ics = buildICS({
      ...BASE,
      organizer: "maria@empresa.com",
      attendees: ["joao@empresa.com", "ana@empresa.com"],
    });
    expect(ics).toContain("ORGANIZER;CN=maria@empresa.com:mailto:maria@empresa.com");
    expect(ics).toContain("ATTENDEE;CN=joao@empresa.com;RSVP=TRUE:mailto:joao@empresa.com");
    expect(ics).toContain("ATTENDEE;CN=ana@empresa.com;RSVP=TRUE:mailto:ana@empresa.com");
  });

  it("dobra linhas longas em no máximo 75 caracteres", () => {
    const ics = buildICS({ ...BASE, description: "x".repeat(300) });
    for (const linha of linhas(ics)) {
      expect(linha.length).toBeLessThanOrEqual(75);
    }
  });

  it("recusa data inválida em vez de gerar arquivo corrompido", () => {
    expect(() => buildICS({ ...BASE, startsAt: "nao-e-data" })).toThrow();
  });
});

describe("nomeArquivoICS", () => {
  it("gera nome a partir do título", () => {
    expect(nomeArquivoICS("Alinhamento semanal")).toBe("alinhamento-semanal.ics");
  });

  it("remove acentos sem apagar a palavra", () => {
    expect(nomeArquivoICS("Revisão de Sprint")).toBe("revisao-de-sprint.ics");
  });

  it("cai para um nome genérico quando só há símbolos", () => {
    expect(nomeArquivoICS("***")).toBe("reuniao.ics");
  });
});

describe("encontrarConflitos", () => {
  const existente = {
    id: "a",
    title: "Reunião A",
    starts_at: "2026-03-05T14:00:00.000Z",
    ends_at: "2026-03-05T15:00:00.000Z",
  };

  it("detecta sobreposição parcial", () => {
    const nova = {
      id: "b",
      title: "Reunião B",
      starts_at: "2026-03-05T14:30:00.000Z",
      ends_at: "2026-03-05T15:30:00.000Z",
    };
    expect(encontrarConflitos(nova, [existente]).map((c) => c.id)).toEqual(["a"]);
  });

  it("detecta reunião contida dentro de outra", () => {
    const nova = {
      id: "b",
      title: "Reunião B",
      starts_at: "2026-03-05T14:15:00.000Z",
      ends_at: "2026-03-05T14:45:00.000Z",
    };
    expect(encontrarConflitos(nova, [existente])).toHaveLength(1);
  });

  it("não considera conflito quando uma termina onde a outra começa", () => {
    // Encostar não é sobrepor: 14h-15h e 15h-16h convivem.
    const nova = {
      id: "b",
      title: "Reunião B",
      starts_at: "2026-03-05T15:00:00.000Z",
      ends_at: "2026-03-05T16:00:00.000Z",
    };
    expect(encontrarConflitos(nova, [existente])).toEqual([]);
  });

  it("ignora reuniões em horários distintos", () => {
    const nova = {
      id: "b",
      title: "Reunião B",
      starts_at: "2026-03-06T14:00:00.000Z",
      ends_at: "2026-03-06T15:00:00.000Z",
    };
    expect(encontrarConflitos(nova, [existente])).toEqual([]);
  });

  it("não conflita consigo mesma ao reagendar", () => {
    expect(encontrarConflitos(existente, [existente])).toEqual([]);
  });

  it("assume uma hora quando a reunião não tem término", () => {
    const semFim = { id: "a", title: "A", starts_at: "2026-03-05T14:00:00.000Z", ends_at: null };
    const nova = { id: "b", title: "B", starts_at: "2026-03-05T14:30:00.000Z", ends_at: null };
    expect(encontrarConflitos(nova, [semFim])).toHaveLength(1);
  });

  it("devolve todos os conflitos, não apenas o primeiro", () => {
    const outra = {
      id: "c",
      title: "Reunião C",
      starts_at: "2026-03-05T14:45:00.000Z",
      ends_at: "2026-03-05T15:15:00.000Z",
    };
    const nova = {
      id: "b",
      title: "B",
      starts_at: "2026-03-05T14:30:00.000Z",
      ends_at: "2026-03-05T15:30:00.000Z",
    };
    expect(encontrarConflitos(nova, [existente, outra]).map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("ignora datas inválidas em vez de quebrar", () => {
    const ruim = { id: "x", title: "X", starts_at: "invalida", ends_at: null };
    const nova = { id: "b", title: "B", starts_at: "2026-03-05T14:30:00.000Z", ends_at: null };
    expect(() => encontrarConflitos(nova, [ruim])).not.toThrow();
    expect(encontrarConflitos(nova, [ruim])).toEqual([]);
  });
});
