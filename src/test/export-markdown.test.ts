import { describe, it, expect } from "vitest";
import { buildMarkdown, nomeDoArquivo } from "@/lib/export-markdown";

const REUNIAO = {
  title: "Alinhamento semanal",
  starts_at: "2026-03-05T14:30:00.000Z",
  organizer: "maria@empresa.com",
  attendees: ["joao@empresa.com", "ana@empresa.com"],
};

describe("buildMarkdown", () => {
  it("abre com título e resumo", () => {
    const md = buildMarkdown({ meeting: REUNIAO, summaryContent: "Discutimos o roadmap." });
    expect(md).toContain("# Alinhamento semanal");
    expect(md).toContain("## Resumo");
    expect(md).toContain("Discutimos o roadmap.");
  });

  it("inclui organizador e participantes quando existem", () => {
    const md = buildMarkdown({ meeting: REUNIAO, summaryContent: "x" });
    expect(md).toContain("**Organizador:** maria@empresa.com");
    expect(md).toContain("**Participantes:** joao@empresa.com, ana@empresa.com");
  });

  it("omite organizador e participantes quando faltam", () => {
    const md = buildMarkdown({
      meeting: { title: "Sem dados", starts_at: REUNIAO.starts_at },
      summaryContent: "x",
    });
    expect(md).not.toContain("**Organizador:**");
    expect(md).not.toContain("**Participantes:**");
  });

  it("sobrevive a attendees que não é array", () => {
    // `attendees` é jsonb — já apareceu como null e como objeto no banco.
    for (const valor of [null, undefined, "joao@empresa.com", { a: 1 }, 42]) {
      const md = buildMarkdown({
        meeting: { ...REUNIAO, attendees: valor },
        summaryContent: "x",
      });
      expect(md).toContain("# Alinhamento semanal");
      expect(md).not.toContain("**Participantes:**");
    }
  });

  it("descarta entradas não-texto dentro de attendees", () => {
    const md = buildMarkdown({
      meeting: { ...REUNIAO, attendees: ["joao@empresa.com", null, 7, "ana@empresa.com"] },
      summaryContent: "x",
    });
    expect(md).toContain("**Participantes:** joao@empresa.com, ana@empresa.com");
  });

  it("lista action items com estado de conclusão", () => {
    const md = buildMarkdown({
      meeting: REUNIAO,
      summaryContent: "x",
      actionItems: [
        { owner: "Maria", task: "Enviar proposta", due_date: "2026-10-01", done: false },
        { owner: "João", task: "Revisar contrato", done: true },
      ],
    });
    expect(md).toContain("- [ ] **Maria**: Enviar proposta (prazo: 2026-10-01)");
    expect(md).toContain("- [x] **João**: Revisar contrato");
  });

  it("omite a seção de action items quando não há nenhum", () => {
    const md = buildMarkdown({ meeting: REUNIAO, summaryContent: "x", actionItems: [] });
    expect(md).not.toContain("## Action Items");
  });

  it("inclui a transcrição com horário", () => {
    const md = buildMarkdown({
      meeting: REUNIAO,
      summaryContent: "x",
      transcripts: [
        { participant_name: "Maria", text: "Bom dia", timestamp: "2026-03-05T14:30:10.000Z" },
      ],
    });
    expect(md).toContain("## Transcrição");
    expect(md).toContain("**Maria**");
    expect(md).toContain("Bom dia");
  });

  it("usa um rótulo genérico quando o trecho não tem autor", () => {
    const md = buildMarkdown({
      meeting: REUNIAO,
      summaryContent: "x",
      transcripts: [{ participant_name: null, text: "Fala solta" }],
    });
    expect(md).toContain("**Participante**");
  });

  it("não quebra com data inválida", () => {
    const md = buildMarkdown({
      meeting: { title: "X", starts_at: "data-invalida" },
      summaryContent: "y",
    });
    expect(md).toContain("# X");
    expect(md).not.toContain("Invalid Date");
  });
});

describe("nomeDoArquivo", () => {
  it("gera nome com slug e data", () => {
    expect(nomeDoArquivo("Alinhamento semanal", REUNIAO.starts_at)).toBe(
      "ata-alinhamento-semanal-2026-03-05.md",
    );
  });

  it("remove acentuação em vez de apagar a palavra", () => {
    // O código antigo removia os acentuados junto com a pontuação:
    // "Revisão de sprint" virava "reviso-de-sprint".
    expect(nomeDoArquivo("Revisão de Sprint", REUNIAO.starts_at)).toBe(
      "ata-revisao-de-sprint-2026-03-05.md",
    );
  });

  it("descarta pontuação sem deixar hífens duplicados", () => {
    expect(nomeDoArquivo("1:1 — Maria & João!", REUNIAO.starts_at)).toBe(
      "ata-11-maria-joao-2026-03-05.md",
    );
  });

  it("cai para um nome genérico quando o título só tem símbolos", () => {
    expect(nomeDoArquivo("***", REUNIAO.starts_at)).toBe("ata-reuniao-2026-03-05.md");
  });

  it("não gera 'Invalid Date' no nome", () => {
    const nome = nomeDoArquivo("Teste", "nao-e-data");
    expect(nome).toBe("ata-teste-sem-data.md");
  });
});
