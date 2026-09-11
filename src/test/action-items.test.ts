import { describe, it, expect } from "vitest";
import { parseActionItems } from "../../supabase/functions/_shared/action-items";

/**
 * Este parser lê texto livre gerado por um modelo de linguagem com um regex.
 * É o ponto mais frágil do produto: quando ele erra, a ata sai com tarefa
 * atribuída à pessoa errada ou com prazo inventado — e ninguém percebe.
 */
describe("parseActionItems", () => {
  it("extrai um item completo", () => {
    const itens = parseActionItems("[Maria] → [Enviar proposta] → [2026-10-01]");
    expect(itens).toEqual([
      { owner: "Maria", task: "Enviar proposta", due_date: "2026-10-01" },
    ]);
  });

  it("extrai vários itens de um bloco", () => {
    const texto = [
      "[Maria] → [Enviar proposta] → [2026-10-01]",
      "[João] → [Revisar contrato] → [Sem prazo]",
      "[A definir] → [Agendar follow-up] → [-]",
    ].join("\n");
    const itens = parseActionItems(texto);
    expect(itens).toHaveLength(3);
    expect(itens.map((i) => i.owner)).toEqual(["Maria", "João", "A definir"]);
  });

  it('devolve lista vazia para "NENHUM"', () => {
    expect(parseActionItems("NENHUM")).toEqual([]);
    expect(parseActionItems("  NENHUM  ")).toEqual([]);
  });

  it("ignora texto que não segue o formato", () => {
    expect(parseActionItems("A reunião foi produtiva e todos concordaram.")).toEqual([]);
  });

  it('trata "Sem prazo" como ausência de data, em qualquer caixa', () => {
    expect(parseActionItems("[Ana] → [Ligar] → [Sem prazo]")[0].due_date).toBeNull();
    expect(parseActionItems("[Ana] → [Ligar] → [SEM PRAZO]")[0].due_date).toBeNull();
    expect(parseActionItems("[Ana] → [Ligar] → [sem prazo]")[0].due_date).toBeNull();
  });

  it("trata hífen e campo vazio como ausência de data", () => {
    expect(parseActionItems("[Ana] → [Ligar] → [-]")[0].due_date).toBeNull();
    expect(parseActionItems("[Ana] → [Ligar] → []")[0].due_date).toBeNull();
  });

  it("descarta data que não dá para interpretar, em vez de inventar uma", () => {
    // Antes isto poderia virar `Invalid Date` e estourar no toISOString().
    expect(parseActionItems("[Ana] → [Ligar] → [semana que vem]")[0].due_date).toBeNull();
    expect(parseActionItems("[Ana] → [Ligar] → [assim que possível]")[0].due_date).toBeNull();
  });

  it("normaliza a data para YYYY-MM-DD", () => {
    const item = parseActionItems("[Ana] → [Ligar] → [2026-03-05T10:00:00Z]")[0];
    expect(item.due_date).toBe("2026-03-05");
  });

  it("remove espaços sobrando nos campos", () => {
    const item = parseActionItems("[  Maria  ] → [  Enviar proposta  ] → [  2026-10-01  ]")[0];
    expect(item.owner).toBe("Maria");
    expect(item.task).toBe("Enviar proposta");
  });

  it("tolera espaçamento variável em volta das setas", () => {
    expect(parseActionItems("[Ana]→[Ligar]→[-]")).toHaveLength(1);
    expect(parseActionItems("[Ana]   →   [Ligar]   →   [-]")).toHaveLength(1);
  });

  it("aceita item cercado de texto explicativo do modelo", () => {
    const texto = `Encontrei os seguintes itens:

[Maria] → [Enviar proposta] → [2026-10-01]

Espero ter ajudado!`;
    expect(parseActionItems(texto)).toHaveLength(1);
  });

  it("não aceita item sem responsável ou sem tarefa", () => {
    // Campos vazios de owner/task não casam: o regex exige ao menos 1 char.
    expect(parseActionItems("[] → [Ligar] → [-]")).toEqual([]);
    expect(parseActionItems("[Ana] → [] → [-]")).toEqual([]);
  });

  it("lida com texto vazio", () => {
    expect(parseActionItems("")).toEqual([]);
    expect(parseActionItems("   ")).toEqual([]);
  });
});
