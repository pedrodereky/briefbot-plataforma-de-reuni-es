import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda de configuração: uma edge function sem entrada em config.toml herda o
 * default implícito do gateway — foi assim que `livekit-webhook` ficou
 * inalcançável (auditoria P0 item 4). Este teste impede a reincidência.
 */
const root = resolve(__dirname, "../..");

function parseVerifyJwt(toml: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let current: string | null = null;
  for (const raw of toml.split("\n")) {
    const line = raw.trim();
    const header = line.match(/^\[functions\.([a-z0-9-]+)\]$/);
    if (header) {
      current = header[1];
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    const value = line.match(/^verify_jwt\s*=\s*(true|false)\s*$/);
    if (current && value) out[current] = value[1] === "true";
  }
  return out;
}

describe("supabase/config.toml", () => {
  const functionDirs = readdirSync(resolve(root, "supabase/functions"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);

  const configured = parseVerifyJwt(
    readFileSync(resolve(root, "supabase/config.toml"), "utf8"),
  );

  it("declara verify_jwt para toda edge function existente", () => {
    const missing = functionDirs.filter((name) => !(name in configured));
    expect(missing).toEqual([]);
  });

  it("não tem configuração órfã apontando para função inexistente", () => {
    const orphans = Object.keys(configured).filter(
      (name) => !functionDirs.includes(name),
    );
    expect(orphans).toEqual([]);
  });

  it("mantém verify_jwt=false restrito ao conjunto revisado", () => {
    // Ampliar esta lista exige justificar por que a função pode ser chamada
    // sem JWT. Ver comentários em supabase/config.toml.
    const allowed = [
      "cron-check-meetings",
      "deepgram-token",
      "livekit-token",
      "livekit-webhook",
      "send-reminder",
    ];
    const open = Object.entries(configured)
      .filter(([, verify]) => !verify)
      .map(([name]) => name)
      .sort();
    expect(open).toEqual(allowed);
  });
});
