import { gzipSync } from 'node:zlib';
import { test, expect } from '@playwright/test';

/**
 * Orçamento de bundle.
 *
 * O app era um único arquivo de 1,87 MB (525 kB gzip): quem abria a tela de
 * LOGIN baixava a stack de videoconferência, os gráficos e o renderizador de
 * markdown junto (auditoria P2 item 19).
 *
 * Este teste mede o que o navegador realmente transfere e falha se o peso
 * voltar a crescer — um limite que ninguém verifica volta a ser furado no
 * primeiro import distraído.
 */

const LIMITE_LOGIN_KB = 300;

/**
 * Soma o peso dos arquivos baixados, medido em gzip.
 *
 * O `vite preview` serve sem compressão, então comprimir aqui aproxima o que
 * um servidor de produção entregaria — é a unidade em que o orçamento faz
 * sentido.
 */
async function medirTransferencia(
  page: import('@playwright/test').Page,
  rota: string,
): Promise<{ totalKb: number; arquivos: string[] }> {
  const vistos = new Map<string, number>();

  page.on('response', async (res) => {
    const caminho = new URL(res.url()).pathname;
    if (!/\.(js|css)$/.test(caminho)) return;
    try {
      const tamanho = gzipSync(await res.body()).length;
      vistos.set(caminho.split('/').pop() ?? caminho, tamanho);
    } catch {
      // resposta já descartada; ignora
    }
  });

  await page.goto(rota, { waitUntil: 'load' });
  // Dá tempo para preloads e imports dinâmicos disparados na montagem.
  await page.waitForTimeout(1500);

  const totalBytes = [...vistos.values()].reduce((soma, n) => soma + n, 0);
  return {
    totalKb: totalBytes / 1024,
    arquivos: [...vistos.keys()].sort(),
  };
}

test('a tela de login não baixa mais que o orçamento', async ({ page }) => {
  const { totalKb, arquivos } = await medirTransferencia(page, '/login');

  console.log(`Login transferiu ${totalKb.toFixed(1)} kB (gzip) em ${arquivos.length} arquivos:`);
  for (const nome of arquivos) console.log(`  - ${nome}`);

  expect(totalKb, `login transferiu ${totalKb.toFixed(1)} kB gzip`).toBeLessThan(LIMITE_LOGIN_KB);
});

test('a tela de login não carrega a stack de videoconferência', async ({ page }) => {
  // LiveKit só faz sentido dentro da sala. Se este teste falhar, algum import
  // estático arrastou o pacote de volta para o caminho inicial.
  const { arquivos } = await medirTransferencia(page, '/login');
  expect(arquivos.filter((nome) => nome.includes('livekit'))).toEqual([]);
});

test('a tela de login não carrega a biblioteca de gráficos', async ({ page }) => {
  const { arquivos } = await medirTransferencia(page, '/login');
  expect(arquivos.filter((nome) => nome.includes('charts'))).toEqual([]);
});
