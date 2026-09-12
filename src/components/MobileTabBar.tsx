import type { LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ListChecks, CalendarDays, MoreHorizontal } from 'lucide-react';
import { useMobileNav } from '@/components/MobileNav';
import { useOpenActionItems } from '@/hooks/useOpenActionItems';
import { cn } from '@/lib/utils';

/**
 * Navegação do celular.
 *
 * Quatro destinos no polegar e "Mais", que abre a gaveta com o resto
 * (Contatos, Gravações, Configurações). A gaveta continua existindo; o que
 * muda é que ela deixa de ser o único caminho.
 *
 * O desenho aprovado trazia uma aba "Copiloto". Ela não virou aba porque não
 * existe tela de copiloto no produto: o copiloto vive dentro da reunião e da
 * ata. Criar a aba exigiria inventar uma rota, então o lugar ficou com Agenda,
 * que é real.
 */
const ABAS: { titulo: string; url: string; icone: LucideIcon; contador?: boolean }[] = [
  { titulo: 'Início', url: '/dashboard', icone: LayoutDashboard },
  { titulo: 'Reuniões', url: '/meetings', icone: Users },
  { titulo: 'Itens', url: '/action-items', icone: ListChecks, contador: true },
  { titulo: 'Agenda', url: '/calendar', icone: CalendarDays },
];

/** Rotas que a gaveta cobre e a barra não: acendem o "Mais". */
const NO_MAIS = ['/contacts', '/recordings', '/settings'];

export function MobileTabBar() {
  const { abrir, aberto } = useMobileNav();
  const { pathname } = useLocation();
  const { data: abertos = 0 } = useOpenActionItems();

  const maisAtivo = NO_MAIS.some((rota) => pathname.startsWith(rota));

  return (
    <nav
      aria-label="Navegação"
      /* pb com safe-area: em iPhone a faixa de gestos comeria os rótulos. */
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {ABAS.map(({ titulo, url, icone: Icone, contador }) => {
        const ativo = pathname === url || (url === '/dashboard' && pathname === '/');
        return (
          <NavLink
            key={url}
            to={url}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 transition-colors',
              ativo ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span className="relative flex">
              <Icone className="h-[21px] w-[21px]" />
              {contador && abertos > 0 && (
                <span className="tabular absolute -right-2.5 -top-1 rounded-full bg-destructive px-1 py-px font-mono text-[9.5px] leading-none text-destructive-foreground">
                  {abertos > 9 ? '9+' : abertos}
                </span>
              )}
            </span>
            <span className={cn('text-[10.5px]', ativo && 'font-medium')}>{titulo}</span>
          </NavLink>
        );
      })}

      <button
        type="button"
        onClick={abrir}
        aria-expanded={aberto}
        className={cn(
          'flex flex-1 flex-col items-center gap-1 py-2 transition-colors',
          maisAtivo || aberto ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <MoreHorizontal className="h-[21px] w-[21px]" />
        <span className={cn('text-[10.5px]', (maisAtivo || aberto) && 'font-medium')}>Mais</span>
      </button>
    </nav>
  );
}
