import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme, useTemaTravado } from '@/contexts/ThemeProvider';

/**
 * `matchMedia` não existe no jsdom. Este dublê guarda os ouvintes para que o
 * teste possa simular o usuário trocando o modo do sistema com o app aberto —
 * que é justamente o comportamento que a opção "Sistema" promete.
 */
function instalarMatchMedia(escuroInicial: boolean) {
  let escuro = escuroInicial;
  const ouvintes = new Set<(e: MediaQueryListEvent) => void>();

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((consulta: string) => ({
      matches: consulta.includes('dark') ? escuro : !escuro,
      media: consulta,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => ouvintes.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => ouvintes.delete(fn),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })),
  });

  return {
    trocarSistemaPara(novo: 'claro' | 'escuro') {
      escuro = novo === 'escuro';
      act(() => {
        ouvintes.forEach((fn) => fn({ matches: escuro } as MediaQueryListEvent));
      });
    },
  };
}

function Sonda() {
  const { tema, temaEfetivo, definirTema } = useTheme();
  return (
    <div>
      <span data-testid="escolha">{tema}</span>
      <span data-testid="efetivo">{temaEfetivo}</span>
      <button onClick={() => definirTema('claro')}>claro</button>
      <button onClick={() => definirTema('escuro')}>escuro</button>
      <button onClick={() => definirTema('sistema')}>sistema</button>
    </div>
  );
}

function Sala() {
  useTemaTravado('escuro');
  return <span data-testid="sala">sala</span>;
}

const raiz = () => document.documentElement.classList;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('começa em "sistema" quando nada foi escolhido', () => {
    instalarMatchMedia(false);
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId('escolha').textContent).toBe('sistema');
  });

  it('resolve "sistema" pela preferência do aparelho', () => {
    instalarMatchMedia(true);
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
    expect(raiz().contains('dark')).toBe(true);
  });

  it('acompanha a troca de modo do sistema com o app aberto', () => {
    const media = instalarMatchMedia(false);
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId('efetivo').textContent).toBe('claro');

    media.trocarSistemaPara('escuro');
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
    expect(raiz().contains('dark')).toBe(true);
  });

  it('a escolha explícita ganha do sistema, nos dois sentidos', () => {
    const media = instalarMatchMedia(true);
    render(<ThemeProvider><Sonda /></ThemeProvider>);

    act(() => screen.getByRole('button', { name: 'claro' }).click());
    expect(screen.getByTestId('efetivo').textContent).toBe('claro');
    expect(raiz().contains('dark')).toBe(false);

    // Sistema muda para claro, mas o usuário escolheu escuro: prevalece escuro.
    act(() => screen.getByRole('button', { name: 'escuro' }).click());
    media.trocarSistemaPara('claro');
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
    expect(raiz().contains('dark')).toBe(true);
  });

  it('guarda a escolha e a recupera no carregamento seguinte', () => {
    instalarMatchMedia(false);
    const { unmount } = render(<ThemeProvider><Sonda /></ThemeProvider>);
    act(() => screen.getByRole('button', { name: 'escuro' }).click());
    expect(localStorage.getItem('briefbot-tema')).toBe('escuro');
    unmount();

    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId('escolha').textContent).toBe('escuro');
  });

  it('volta a obedecer ao sistema quando o usuário escolhe "sistema"', () => {
    const media = instalarMatchMedia(false);
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    act(() => screen.getByRole('button', { name: 'escuro' }).click());
    act(() => screen.getByRole('button', { name: 'sistema' }).click());

    expect(screen.getByTestId('efetivo').textContent).toBe('claro');
    media.trocarSistemaPara('escuro');
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
  });

  it('a sala trava em escuro mesmo com o tema claro escolhido, e destrava ao sair', () => {
    instalarMatchMedia(false);
    function App({ naSala }: { naSala: boolean }) {
      return (
        <ThemeProvider>
          <Sonda />
          {naSala && <Sala />}
        </ThemeProvider>
      );
    }
    const { rerender } = render(<App naSala={false} />);
    act(() => screen.getByRole('button', { name: 'claro' }).click());
    expect(raiz().contains('dark')).toBe(false);

    rerender(<App naSala />);
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
    expect(raiz().contains('dark')).toBe(true);
    // A escolha do usuário não é sobrescrita — só ignorada enquanto está lá.
    expect(screen.getByTestId('escolha').textContent).toBe('claro');

    rerender(<App naSala={false} />);
    expect(raiz().contains('dark')).toBe(false);
  });

  it('não quebra quando o armazenamento está bloqueado', () => {
    instalarMatchMedia(false);
    const erro = () => {
      throw new Error('bloqueado');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(erro);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(erro);

    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId('escolha').textContent).toBe('sistema');
    act(() => screen.getByRole('button', { name: 'escuro' }).click());
    expect(screen.getByTestId('efetivo').textContent).toBe('escuro');
  });
});
