import { describe, it, expect } from "vitest";
import { getWeekDays, getMonthGrid, positionMeeting } from "@/lib/calendar-utils";

/** Constrói uma data local, evitando o deslocamento de fuso do formato ISO. */
function local(ano: number, mes: number, dia: number, hora = 0, minuto = 0): string {
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

describe("getWeekDays", () => {
  it("devolve 7 dias", () => {
    expect(getWeekDays(new Date(2026, 2, 5))).toHaveLength(7);
  });

  it("começa na segunda-feira", () => {
    // 05/03/2026 é uma quinta; a semana deve abrir em 02/03 (segunda).
    const dias = getWeekDays(new Date(2026, 2, 5));
    expect(dias[0].getDay()).toBe(1);
    expect(dias[0].getDate()).toBe(2);
  });

  it("termina no domingo", () => {
    const dias = getWeekDays(new Date(2026, 2, 5));
    expect(dias[6].getDay()).toBe(0);
  });

  it("funciona quando a data já é domingo", () => {
    // Domingo pertence à semana que começou na segunda anterior.
    const domingo = new Date(2026, 2, 8);
    const dias = getWeekDays(domingo);
    expect(dias[0].getDate()).toBe(2);
    expect(dias[6].getDate()).toBe(8);
  });

  it("atravessa a virada de mês", () => {
    const dias = getWeekDays(new Date(2026, 2, 31));
    expect(dias.map((d) => d.getMonth())).toContain(3);
  });
});

describe("getMonthGrid", () => {
  it("devolve semanas completas de 7 dias", () => {
    const semanas = getMonthGrid(new Date(2026, 2, 15));
    expect(semanas.length).toBeGreaterThanOrEqual(4);
    for (const semana of semanas) {
      expect(semana).toHaveLength(7);
    }
  });

  it("cobre todos os dias do mês", () => {
    const semanas = getMonthGrid(new Date(2026, 2, 15));
    const dias = semanas.flat().filter((d) => d.getMonth() === 2);
    expect(dias).toHaveLength(31);
  });

  it("inclui dias vizinhos para completar a primeira e a última semana", () => {
    const semanas = getMonthGrid(new Date(2026, 2, 15));
    const todos = semanas.flat();
    expect(todos[0].getMonth()).not.toBe(2);
    expect(todos[0].getDay()).toBe(1);
  });

  it("lida com fevereiro de ano bissexto", () => {
    const semanas = getMonthGrid(new Date(2028, 1, 10));
    const dias = semanas.flat().filter((d) => d.getMonth() === 1);
    expect(dias).toHaveLength(29);
  });
});

describe("positionMeeting", () => {
  it("posiciona o início do dia no topo", () => {
    const pos = positionMeeting(local(2026, 3, 5, 7, 0), local(2026, 3, 5, 8, 0));
    expect(pos.top).toBe("0%");
  });

  it("posiciona o meio do dia proporcionalmente", () => {
    // Janela padrão 7h-22h = 15h. Começar às 14h30 são 7,5h -> 50%.
    const pos = positionMeeting(local(2026, 3, 5, 14, 30), local(2026, 3, 5, 15, 30));
    expect(parseFloat(pos.top)).toBeCloseTo(50, 1);
  });

  it("dá altura proporcional à duração", () => {
    // 1h30 em 15h de janela = 10%.
    const pos = positionMeeting(local(2026, 3, 5, 9, 0), local(2026, 3, 5, 10, 30));
    expect(parseFloat(pos.height)).toBeCloseTo(10, 1);
  });

  it("assume 30 minutos quando não há término", () => {
    const pos = positionMeeting(local(2026, 3, 5, 9, 0), null);
    expect(parseFloat(pos.height)).toBeCloseTo((30 / 900) * 100, 1);
  });

  it("nunca produz topo negativo antes do início da janela", () => {
    const pos = positionMeeting(local(2026, 3, 5, 5, 0), local(2026, 3, 5, 6, 0));
    expect(parseFloat(pos.top)).toBeGreaterThanOrEqual(0);
  });

  it("mantém altura mínima visível para reunião muito curta", () => {
    const pos = positionMeeting(local(2026, 3, 5, 9, 0), local(2026, 3, 5, 9, 1));
    expect(parseFloat(pos.height)).toBeGreaterThanOrEqual(2);
  });

  it("não deixa a reunião ultrapassar o fim da janela", () => {
    const pos = positionMeeting(local(2026, 3, 5, 21, 0), local(2026, 3, 6, 2, 0));
    expect(parseFloat(pos.top) + parseFloat(pos.height)).toBeLessThanOrEqual(100.01);
  });

  it("respeita janela de horário personalizada", () => {
    // Janela 0h-24h: meio-dia deve cair em 50%.
    const pos = positionMeeting(local(2026, 3, 5, 12, 0), local(2026, 3, 5, 13, 0), 0, 24);
    expect(parseFloat(pos.top)).toBeCloseTo(50, 1);
  });
});
