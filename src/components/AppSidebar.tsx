import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Users, ListChecks, UserCircle,
  Video, Settings, Plus, Zap, PanelLeftClose, PanelLeft, LogOut, X,
} from 'lucide-react';
import { useMobileNav } from '@/components/MobileNav';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { useOpenActionItems } from '@/hooks/useOpenActionItems';
import { useAuth } from '@/contexts/AuthProvider';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { cn } from '@/lib/utils';
import { MarcaBriefBot } from '@/components/MarcaBriefBot';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Uma lista só, sem rótulos de seção.
 *
 * A divisão anterior em "Menu" e "Trabalho" gastava duas linhas para separar
 * seis itens que cabem de uma vez na altura da tela — e nenhum usuário procura
 * "Gravações" dentro de "Trabalho", procura por "Gravações".
 */
const itens = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Agenda', url: '/calendar', icon: CalendarDays },
  { title: 'Reuniões', url: '/meetings', icon: Users },
  { title: 'Action Items', url: '/action-items', icon: ListChecks, contador: true },
  { title: 'Contatos', url: '/contacts', icon: UserCircle },
  { title: 'Gravações', url: '/recordings', icon: Video },
  { title: 'Configurações', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { createInstant, creating } = useCreateInstantMeeting();
  const [createOpen, setCreateOpen] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: abertos } = useOpenActionItems();
  const { aberto, fechar } = useMobileNav();

  // Navegou: a gaveta fecha sozinha. Sem isto o usuário toca em "Reuniões" e
  // continua olhando para o menu, sem sinal de que algo aconteceu.
  useEffect(() => {
    fechar();
  }, [location.pathname, fechar]);

  // Esc fecha, e o fundo da página não rola atrás da gaveta aberta.
  useEffect(() => {
    if (!aberto) return;
    // "Recolhido" é um gesto de desktop. Quem recolheu no computador e depois
    // abriu a gaveta no celular veria uma coluna de ícones ocupando 264px.
    setCollapsed(false);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, fechar]);

  const nome = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';
  const iniciais = nome
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((parte: string) => parte[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* Fundo escurecido: no celular a gaveta cobre a tela, e tocar fora é o
          jeito mais rápido de sair dela. */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={fechar}
          aria-hidden="true"
        />
      )}

      <aside
        /* Até lg a barra sai do fluxo e desliza por cima: em 390px ela ficava
           com 204 dos 390 disponíveis, e sobravam 186 para o conteúdo — título
           quebrado, botão cortado, linha de reunião sem o título. */
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-[264px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:z-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width]',
          aberto ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[64px]' : 'lg:w-[204px]',
        )}
        aria-label="Navegação principal"
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center px-[18px]',
            collapsed ? 'justify-center px-0' : 'justify-between',
          )}
        >
          <div className="flex items-center gap-2.5">
            <MarcaBriefBot className="h-[17px] w-[17px] text-primary" />
            {!collapsed && (
              <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                BriefBot
              </span>
            )}
          </div>
          <button
            onClick={fechar}
            aria-label="Fechar menu"
            className="text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Recolher menu"
              className="hidden text-muted-foreground transition-colors hover:text-foreground lg:block"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={cn('shrink-0 space-y-1.5 px-3 pb-4', collapsed && 'px-2')}>
          {collapsed ? (
            <>
              <DicaLateral label="Nova reunião">
                <button
                  onClick={() => setCreateOpen(true)}
                  aria-label="Nova reunião"
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </DicaLateral>
              <DicaLateral label="Reunião rápida">
                <button
                  onClick={() => createInstant()}
                  disabled={creating}
                  aria-label="Reunião rápida"
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <Zap className="h-4 w-4" />
                </button>
              </DicaLateral>
            </>
          ) : (
            <>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Nova reunião
              </button>
              <button
                onClick={() => createInstant()}
                disabled={creating}
                className="flex w-full items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <Zap className="h-4 w-4" /> Reunião rápida
              </button>
            </>
          )}
          <CreateMeetingDialog open={createOpen} onOpenChange={setCreateOpen} />
        </div>

        <nav className={cn('flex-1 space-y-0.5 overflow-y-auto px-2', collapsed && 'px-2')}>
          {itens.map((item) => (
            <ItemDoMenu
              key={item.url}
              item={item}
              collapsed={collapsed}
              contador={item.contador ? abertos ?? 0 : 0}
              ativo={
                location.pathname === item.url ||
                (item.url === '/dashboard' && location.pathname === '/')
              }
            />
          ))}
        </nav>

        <div className={cn('shrink-0 px-[18px] py-4', collapsed && 'px-2')}>
          {collapsed ? (
            <DicaLateral label="Expandir menu">
              <button
                onClick={() => setCollapsed(false)}
                aria-label="Expandir menu"
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </DicaLateral>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[11.5px] font-semibold text-accent-foreground">
                {iniciais || '?'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {nome.split('@')[0] || 'Conta'}
              </span>
              <button
                onClick={signOut}
                aria-label="Sair"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          </div>
      </aside>
    </>
  );
}

function ItemDoMenu({
  item,
  collapsed,
  ativo,
  contador,
}: {
  item: { title: string; url: string; icon: LucideIcon };
  collapsed: boolean;
  ativo: boolean;
  contador: number;
}) {
  const Icon = item.icon;

  const conteudo = (
    <NavLink
      to={item.url}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
        collapsed && 'justify-center px-0',
        ativo
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', ativo && 'text-primary')} />
      {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
      {!collapsed && contador > 0 && (
        <span className="font-mono text-[11.5px] text-destructive">{contador}</span>
      )}
      {collapsed && contador > 0 && (
        <span className="absolute ml-5 -mt-4 h-1.5 w-1.5 rounded-full bg-destructive" />
      )}
    </NavLink>
  );

  return collapsed ? <DicaLateral label={item.title}>{conteudo}</DicaLateral> : conteudo;
}

function DicaLateral({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
