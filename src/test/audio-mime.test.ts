import { describe, it, expect } from "vitest";
import { escolherMimeType, FORMATOS_PREFERIDOS } from "@/lib/audio-mime";

/** Simula o suporte de um navegador específico. */
function navegadorQueSuporta(...formatos: string[]) {
  return (tipo: string) => formatos.includes(tipo);
}

describe("escolherMimeType", () => {
  it("prefere webm/opus quando disponível (Chrome, Edge, Firefox)", () => {
    const suporte = navegadorQueSuporta(
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    );
    expect(escolherMimeType(suporte)).toBe("audio/webm;codecs=opus");
  });

  it("cai para mp4 no Safari, onde webm não existe", () => {
    // Este é o caso que quebrava a transcrição inteira: o código fixava
    // webm/opus e o construtor do MediaRecorder lançava no Safari e no iOS.
    const safari = navegadorQueSuporta("audio/mp4;codecs=mp4a.40.2", "audio/mp4");
    expect(escolherMimeType(safari)).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("aceita webm sem codec explícito", () => {
    expect(escolherMimeType(navegadorQueSuporta("audio/webm"))).toBe("audio/webm");
  });

  it("aceita ogg/opus", () => {
    expect(escolherMimeType(navegadorQueSuporta("audio/ogg;codecs=opus"))).toBe(
      "audio/ogg;codecs=opus",
    );
  });

  it("devolve null quando nada é suportado, em vez de deixar o MediaRecorder lançar", () => {
    expect(escolherMimeType(navegadorQueSuporta())).toBeNull();
  });

  it("devolve null quando o navegador não tem MediaRecorder", () => {
    expect(escolherMimeType(null)).toBeNull();
  });

  it("respeita a ordem de preferência declarada", () => {
    // Suportando todos, sempre vence o primeiro da lista.
    const suportaTudo = navegadorQueSuporta(...FORMATOS_PREFERIDOS);
    expect(escolherMimeType(suportaTudo)).toBe(FORMATOS_PREFERIDOS[0]);
  });

  it("só oferece formatos de áudio", () => {
    for (const formato of FORMATOS_PREFERIDOS) {
      expect(formato.startsWith("audio/")).toBe(true);
    }
  });
});
