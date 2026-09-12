import { test, expect } from '@playwright/test';

/**
 * Fumaça de roteamento e proteção de rotas.
 *
 * Roda contra um build real servido pelo `vite preview`, com credenciais
 * fictícias do Supabase: nada aqui depende de um projeto vivo. O objetivo é
 * pegar o que quebra silenciosamente — rota protegida que deixou de proteger,
 * página que não monta, bundle que falha ao carregar.
 */

test.describe('rotas públicas', () => {
  test('a tela de login monta e mostra o formulário', async ({ page }) => {
    await page.goto('/login');
    // `e-?mail` cobre tanto "Email" quanto "E-mail de trabalho": o rótulo é
    // texto de produto e muda; o que o teste garante é que existe um campo.
    await expect(page.getByRole('textbox', { name: /e-?mail/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i }).first()).toBeVisible();
  });

  test('rota inexistente cai no 404, não em tela branca', async ({ page }) => {
    await page.goto('/rota-que-nao-existe');
    await expect(page.getByText(/404|não encontrada|nao encontrada/i).first()).toBeVisible();
  });
});

test.describe('proteção de rotas', () => {
  // Cada uma destas exige sessão; sem login o app tem de redirecionar.
  for (const rota of ['/dashboard', '/meetings', '/action-items', '/contacts', '/settings']) {
    test(`${rota} redireciona visitante anônimo para /login`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForURL('**/login', { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe('/login');
    });
  }
});

test.describe('entrada de convidado', () => {
  test('sem token na URL, a página de entrada ainda carrega', async ({ page }) => {
    // O link sem `?t=` não dá acesso, mas não pode quebrar a renderização:
    // o convidado precisa ver uma mensagem, não uma tela branca.
    const erros: string[] = [];
    page.on('pageerror', (err) => erros.push(err.message));

    await page.goto('/join/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    expect(erros).toEqual([]);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test('o bundle carrega sem erro de console na tela inicial', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (err) => erros.push(err.message));

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  expect(erros).toEqual([]);
});
