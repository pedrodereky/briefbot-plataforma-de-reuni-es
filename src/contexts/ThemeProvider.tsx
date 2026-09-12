import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tema da interface.
 *
 * `sistema` é o padrão e não é um valor neutro: significa "obedeça ao
 * aparelho", inclusive quando o usuário troca o modo do sistema com o app
 * aberto. `claro` e `escuro` são a escolha explícita e ganham do sistema nos
 * dois sentidos.
 *
 * O CSS já resolve o caso `sistema` sozinho, por `prefers-color-scheme`
 * (src/index.css). Este provider existe para a escolha explícita e para o
 * travamento da sala de reunião.
 */
export type Tema = "sistema" | "claro" | "escuro";

const CHAVE = "briefbot-tema";

interface ContextoTema {
  /** O que o usuário escolheu. */
  tema: Tema;
  /** O que está efetivamente na tela agora, já resolvido. */
  temaEfetivo: "claro" | "escuro";
  definirTema: (tema: Tema) => void;
  /**
   * Trava o tema numa rota, ignorando a preferência. Devolve a função que
   * destrava — chamar no cleanup do efeito.
   */
  travarTema: (tema: "claro" | "escuro") => () => void;
}

const Contexto = createContext<ContextoTema | undefined>(undefined);

export function temaSalvo(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE);
    if (valor === "claro" || valor === "escuro" || valor === "sistema") return valor;
  } catch {
    // Navegação privada ou armazenamento bloqueado: cai no padrão.
  }
  return "sistema";
}

function preferenciaDoSistema(): "claro" | "escuro" {
  if (typeof window === "undefined" || !window.matchMedia) return "claro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/**
 * Aplica no <html> a classe do tema JÁ RESOLVIDO — inclusive quando a escolha
 * é `sistema`.
 *
 * Poderia bastar deixar as duas classes fora e confiar no @media do CSS, mas
 * as variantes `dark:` do Tailwind estão configuradas por classe
 * (`darkMode: ["class"]`): sem a classe, `dark:` não vale nada no modo
 * sistema. Então o CSS resolve o primeiro pixel e a classe assume logo em
 * seguida — as duas coisas concordam por construção, porque os valores são
 * os mesmos.
 */
function aplicarClasse(efetivo: "claro" | "escuro") {
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", efetivo === "escuro");
  raiz.classList.toggle("light", efetivo === "claro");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaSalvo);
  const [doSistema, setDoSistema] = useState<"claro" | "escuro">(preferenciaDoSistema);
  const [travado, setTravado] = useState<"claro" | "escuro" | null>(null);

  const temaEfetivo = travado ?? (tema === "sistema" ? doSistema : tema);

  // Acompanha a troca de modo do sistema com o app aberto.
  useEffect(() => {
    if (!window.matchMedia) return;
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = (e: MediaQueryListEvent) => setDoSistema(e.matches ? "escuro" : "claro");
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  useEffect(() => {
    aplicarClasse(temaEfetivo);
  }, [temaEfetivo]);

  const definirTema = useCallback((novo: Tema) => {
    setTema(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem persistência a escolha vale só para esta sessão; não é motivo
      // para falhar a troca.
    }
  }, []);

  const travarTema = useCallback((alvo: "claro" | "escuro") => {
    setTravado(alvo);
    return () => setTravado(null);
  }, []);

  const valor = useMemo(
    () => ({ tema, temaEfetivo, definirTema, travarTema }),
    [tema, temaEfetivo, definirTema, travarTema],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTheme(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useTheme precisa estar dentro de ThemeProvider");
  return contexto;
}

/**
 * Trava o tema enquanto a tela estiver montada.
 *
 * A sala de reunião usa isto: vídeo pede fundo escuro ao redor, como Meet e
 * Zoom fazem. É a única rota que ignora a preferência do usuário.
 */
export function useTemaTravado(alvo: "claro" | "escuro") {
  const { travarTema } = useTheme();
  useEffect(() => travarTema(alvo), [travarTema, alvo]);
}
