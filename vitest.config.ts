import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Só o que é lógica pura e testável. `auth.ts` fica de fora porque
      // importa de esm.sh e o vitest não consegue carregá-lo; ele é coberto
      // pelos testes de schema e pelas guardas em edge-functions-auth.test.ts.
      include: ["src/lib/**", "supabase/functions/_shared/**"],
      exclude: ["src/lib/utils.ts", "src/lib/telemetry.ts", "supabase/functions/_shared/auth.ts"],
      thresholds: { statements: 80, branches: 80, functions: 75 },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
