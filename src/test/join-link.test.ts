import { describe, it, expect } from "vitest";
import { buildJoinLink, readJoinToken, PARAM_TOKEN } from "@/lib/join-link";

const ORIGEM = "https://app.exemplo.com";
const MEETING = "22222222-2222-2222-2222-222222222222";

describe("buildJoinLink", () => {
  it("monta o link com id e token", () => {
    expect(buildJoinLink(MEETING, "abc123", ORIGEM)).toBe(
      `${ORIGEM}/join/${MEETING}?${PARAM_TOKEN}=abc123`,
    );
  });

  it("escapa caracteres especiais do token", () => {
    // O token é base64url, mas escapar evita link quebrado se o formato mudar.
    const link = buildJoinLink(MEETING, "a+b/c=d", ORIGEM);
    expect(link).toContain("a%2Bb%2Fc%3Dd");
    expect(link).not.toContain("a+b/c=d");
  });

  it("devolve null sem token — nunca um link que não funciona", () => {
    expect(buildJoinLink(MEETING, null, ORIGEM)).toBeNull();
    expect(buildJoinLink(MEETING, undefined, ORIGEM)).toBeNull();
    expect(buildJoinLink(MEETING, "", ORIGEM)).toBeNull();
  });

  it("devolve null sem id da reunião", () => {
    expect(buildJoinLink("", "abc123", ORIGEM)).toBeNull();
  });
});

describe("readJoinToken", () => {
  it("lê o token da query string", () => {
    expect(readJoinToken(`?${PARAM_TOKEN}=abc123`)).toBe("abc123");
  });

  it("decodifica valor escapado", () => {
    expect(readJoinToken(`?${PARAM_TOKEN}=a%2Bb%2Fc%3Dd`)).toBe("a+b/c=d");
  });

  it("acha o token entre outros parâmetros", () => {
    expect(readJoinToken(`?utm=x&${PARAM_TOKEN}=abc123&y=2`)).toBe("abc123");
  });

  it("devolve null quando não há token", () => {
    expect(readJoinToken("")).toBeNull();
    expect(readJoinToken("?outro=1")).toBeNull();
    expect(readJoinToken(`?${PARAM_TOKEN}=`)).toBeNull();
  });
});

describe("ida e volta", () => {
  it("o token sobrevive a montar e ler de volta", () => {
    const token = "Ab3-_xyz789+/=";
    const link = buildJoinLink(MEETING, token, ORIGEM)!;
    const query = link.slice(link.indexOf("?"));
    expect(readJoinToken(query)).toBe(token);
  });
});
