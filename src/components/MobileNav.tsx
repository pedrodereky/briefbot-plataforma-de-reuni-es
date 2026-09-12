import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Estado da gaveta de navegação no celular.
 *
 * Vive num contexto porque quem abre (o botão no cabeçalho da página) e quem
 * é aberto (o menu lateral) são irmãos, não pai e filho.
 */
interface ContextoMobileNav {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
}

const Contexto = createContext<ContextoMobileNav | undefined>(undefined);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const abrir = useCallback(() => setAberto(true), []);
  const fechar = useCallback(() => setAberto(false), []);
  const valor = useMemo(() => ({ aberto, abrir, fechar }), [aberto, abrir, fechar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Fora do AppLayout — no login, por exemplo — não há menu para abrir. Em vez
 * de estourar, devolve um estado inerte, e o botão some sozinho.
 */
export function useMobileNav(): ContextoMobileNav & { disponivel: boolean } {
  const contexto = useContext(Contexto);
  const inerte = useMemo(
    () => ({ aberto: false, abrir: () => undefined, fechar: () => undefined }),
    [],
  );
  return { ...(contexto ?? inerte), disponivel: Boolean(contexto) };
}
