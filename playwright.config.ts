import { defineConfig, devices } from '@playwright/test';

/**
 * O config anterior importava `lovable-agent-playwright-config`, pacote que
 * **não existe no registro do npm** e não está no package.json — ou seja, o
 * Playwright nunca chegou a carregar (auditoria P2 item 16). Aqui ele é
 * configurado do zero, sem dependência externa.
 *
 * Os testes sobem o app com `vite preview` sobre um build real e usam
 * credenciais fictícias do Supabase: cobrem o que não depende de backend —
 * roteamento, proteção de rotas e renderização das telas públicas. Fluxos que
 * exigem sessão real ficam de fora de propósito, para o CI não depender de um
 * projeto Supabase vivo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Ambientes que já trazem o Chromium instalado (contêineres de agente,
        // imagens corporativas) apontam PW_CHROMIUM_PATH para o binário e
        // dispensam o download. No CI comum a variável não existe e o
        // Playwright usa o browser que ele mesmo instalou.
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: {
    // --host 127.0.0.1: sem isso o vite tenta escutar em IPv6, que não
    // existe em alguns contêineres de CI.
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://exemplo.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e',
      VITE_SUPABASE_PROJECT_ID: 'e2e',
    },
  },
});
