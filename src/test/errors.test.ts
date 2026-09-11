import { describe, it, expect } from "vitest";
import { mensagemDeErro } from "@/lib/errors";

/**
 * Este helper substituiu 20 ocorrências de `catch (err: any) { err.message }`.
 * O padrão antigo exibia literalmente "undefined" no toast quando o valor
 * lançado não era um Error — é justamente esse caso que os testes fixam.
 */
describe("mensagemDeErro", () => {
  it("usa a mensagem de um Error", () => {
    expect(mensagemDeErro(new Error("Falha ao salvar"))).toBe("Falha ao salvar");
  });

  it("usa a string lançada diretamente", () => {
    expect(mensagemDeErro("algo quebrou")).toBe("algo quebrou");
  });

  it("lê `message` de objeto simples, como os erros do supabase-js", () => {
    expect(mensagemDeErro({ message: "JWT expired", code: "PGRST301" })).toBe("JWT expired");
  });

  it("cai para o texto de reserva quando não há mensagem utilizável", () => {
    expect(mensagemDeErro(null)).toBe("Erro inesperado");
    expect(mensagemDeErro(undefined)).toBe("Erro inesperado");
    expect(mensagemDeErro(42)).toBe("Erro inesperado");
    expect(mensagemDeErro({})).toBe("Erro inesperado");
    expect(mensagemDeErro([])).toBe("Erro inesperado");
  });

  it("ignora mensagem vazia ou só de espaços", () => {
    expect(mensagemDeErro(new Error(""))).toBe("Erro inesperado");
    expect(mensagemDeErro("   ")).toBe("Erro inesperado");
    expect(mensagemDeErro({ message: "  " })).toBe("Erro inesperado");
  });

  it("ignora `message` que não é string", () => {
    expect(mensagemDeErro({ message: 500 })).toBe("Erro inesperado");
    expect(mensagemDeErro({ message: null })).toBe("Erro inesperado");
  });

  it("aceita texto de reserva personalizado", () => {
    expect(mensagemDeErro(null, "Erro ao gerar ata")).toBe("Erro ao gerar ata");
  });

  it("nunca devolve a string 'undefined'", () => {
    // Sintoma exato do padrão antigo, que chegava a aparecer na interface.
    for (const valor of [null, undefined, {}, 0, false, []]) {
      expect(mensagemDeErro(valor)).not.toBe("undefined");
    }
  });
});
