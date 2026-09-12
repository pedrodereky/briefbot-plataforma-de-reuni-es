import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Casca dos painéis da sala (transcrição, participantes).
 *
 * No computador é uma coluna de 320px à direita. No celular vira uma folha que
 * sobe de baixo, cobrindo pouco mais da metade da tela: a coluna de 320px
 * deixava 70px para o vídeo num telefone de 390px, ou seja, escolher entre ver
 * quem fala e ver o que foi dito.
 *
 * A folha não bloqueia a chamada: os controles continuam embaixo e o vídeo
 * segue visível acima dela.
 */
export function PainelDaSala({
  titulo,
  icone: Icone,
  onFechar,
  children,
}: {
  titulo: ReactNode;
  icone: LucideIcon;
  /** Sem isto o painel não mostra o X — quem controla é a tela de fora. */
  onFechar?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      /* Empilha DENTRO da área de vídeo, não por cima da tela: assim os
         controles da chamada (microfone, câmera, sair) continuam alcançáveis
         com o painel aberto. Flutuando em `fixed`, ele os cobria. */
      className="
        flex max-h-[55%] shrink-0 flex-col rounded-t-xl border-t border-border bg-card
        lg:h-full lg:max-h-none lg:w-[320px] lg:rounded-none lg:border-l lg:border-t-0
      "
    >
      {/* Puxador: no celular a folha parece arrastável e é o que sinaliza que
          ela é uma camada, não uma tela nova. */}
      <div className="flex justify-center pt-2 lg:hidden">
        <span className="h-1 w-9 rounded-full bg-border" aria-hidden="true" />
      </div>

      <div className="flex items-center gap-2 border-b border-border p-3">
        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-sm font-medium">{titulo}</span>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar painel"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
