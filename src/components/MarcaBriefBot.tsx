import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A marca do BriefBot: a letra dentro do balão.
 *
 * Mesma geometria de `public/icone.svg`, para o favicon e a interface não
 * divergirem — se um mudar, o outro precisa mudar junto.
 *
 * A letra é VAZADA por máscara, não pintada. Nos tamanhos em que a marca
 * aparece (17px no menu, 18px no login) uma letra de traço vira borrão, e
 * pintá-la exigiria saber a cor do fundo — que muda com o tema. Vazada, o
 * fundo aparece sozinho através dela.
 */
export function MarcaBriefBot({ className }: { className?: string }) {
  // Duas instâncias na mesma página (menu e diálogo) não podem compartilhar o
  // id da máscara.
  const mascara = useId();

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      fill="currentColor"
      role="img"
      aria-label="BriefBot"
    >
      <mask id={mascara}>
        <rect width="32" height="32" fill="#fff" />
        <path
          d="M12.8 8.5v11M12.8 8.5h3.6a2.75 2.75 0 0 1 0 5.5h-3.6M12.8 14h4.4a2.75 2.75 0 0 1 0 5.5h-4.4"
          fill="none"
          stroke="#000"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <path mask={`url(#${mascara})`} d="M4 3h24v20H12l-8 7z" />
    </svg>
  );
}
