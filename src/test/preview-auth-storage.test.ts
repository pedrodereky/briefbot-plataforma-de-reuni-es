// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { brokeredPreviewStorage } from '@/integrations/supabase/previewAuthStorage';

/**
 * Guarda do caminho de login DENTRO do preview da Lovable.
 *
 * Fora do preview o supabase-js guarda a sessão no localStorage. Dentro do
 * iframe do editor, ela é intermediada por postMessage — e esse é justamente o
 * caminho exercitado quando alguém tenta entrar pelo preview. Como o arquivo é
 * gerado pela Lovable e já foi regenerado uma vez no meio do caminho, o que
 * estes testes fixam é o contrato de que o app depende: quando o editor não
 * responde, o login não pode quebrar — tem de cair no armazenamento local.
 */

const UUID = '8dcc4773-219d-46df-b50f-b0c0aafdcf58';

function simularPreview({ enquadrado }: { enquadrado: boolean }) {
  const url = `https://id-preview--${UUID}.lovable.app/login`;
  // jsdom não deixa reatribuir location; navegar por history mantém o host.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url) as unknown as Location,
  });
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: enquadrado ? ({ postMessage: vi.fn() } as unknown as Window) : window,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('brokeredPreviewStorage', () => {
  it('fora de um iframe usa o localStorage direto', () => {
    simularPreview({ enquadrado: false });
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });

  it('num host que não é de preview usa o localStorage, mesmo enquadrado', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.briefbot.com.br/login') as unknown as Location,
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() } as unknown as Window,
    });
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });

  it('no preview enquadrado devolve o intermediário, não o localStorage', () => {
    simularPreview({ enquadrado: true });
    const guarda = brokeredPreviewStorage();
    expect(guarda).not.toBe(localStorage);
    expect(typeof (guarda as Storage).getItem).toBe('function');
  });

  it('editor calado: a leitura cai no local em vez de estourar', async () => {
    // É o caso que derrubaria o login: ninguém responde ao postMessage.
    vi.useFakeTimers();
    simularPreview({ enquadrado: true });
    localStorage.setItem('sb-x-auth-token', '{"access_token":"abc"}');

    const guarda = brokeredPreviewStorage() as Storage;
    const leitura = guarda.getItem('sb-x-auth-token') as unknown as Promise<string | null>;
    await vi.advanceTimersByTimeAsync(6000);

    await expect(leitura).resolves.toBe('{"access_token":"abc"}');
  });

  it('a escrita grava local antes de falar com o editor', async () => {
    vi.useFakeTimers();
    simularPreview({ enquadrado: true });

    const guarda = brokeredPreviewStorage() as Storage;
    const escrita = guarda.setItem('sb-x-auth-token', '{"a":1}') as unknown as Promise<void>;

    // Sem esperar o editor: o valor já tem de estar no local, senão uma sessão
    // recém-criada se perderia no recarregamento.
    expect(localStorage.getItem('sb-x-auth-token')).toBe('{"a":1}');
    await vi.advanceTimersByTimeAsync(6000);
    await expect(escrita).resolves.toBeUndefined();
  });

  it('a remoção também não depende do editor', async () => {
    vi.useFakeTimers();
    simularPreview({ enquadrado: true });
    localStorage.setItem('sb-x-auth-token', '{"a":1}');

    const guarda = brokeredPreviewStorage() as Storage;
    const remocao = guarda.removeItem('sb-x-auth-token') as unknown as Promise<void>;

    expect(localStorage.getItem('sb-x-auth-token')).toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    await expect(remocao).resolves.toBeUndefined();
  });
});
