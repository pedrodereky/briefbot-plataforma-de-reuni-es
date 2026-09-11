import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Users, ListChecks, UserCircle,
  Video, Settings, Bot, Plus, Zap, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { useCreateInstantMeeting } from '@/hooks/useCreateInstantMeeting';
import { CreateMeetingDialog } from '@/components/CreateMeetingDialog';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const sections = [
  {
    label: 'Menu',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
      { title: 'Agenda', url: '/calendar', icon: CalendarDays },
      { title: 'Reunioes', url: '/meetings', icon: Users },
    ],
  },
  {
    label: 'Trabalho',
    items: [
      { title: 'Action Items', url: '/action-items', icon: ListChecks },
      { title: 'Contatos', url: '/contacts', icon: UserCircle },
      { title: 'Gravacoes', url: '/recordings', icon: Video },
    ],
  },
];

const bottomItems = [
  { title: 'Configuracoes', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { createInstant, creating } = useCreateInstantMeeting();
  const [createOpen, setCreateOpen] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        'flex flex-col h-screen sticky top-0 border-r border-border/50 bg-card transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center h-14 border-b border-border/50 px-4 shrink-0',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground">BriefBot</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className={cn('px-3 py-3 space-y-1 shrink-0', collapsed && 'px-2')}>
        {collapsed ? (
          <>
            <SidebarTooltip label="Nova Reuniao">
              <button
                onClick={() => setCreateOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mx-auto"
              >
                <Plus className="h-4 w-4" />
              </button>
            </SidebarTooltip>
            <SidebarTooltip label="Reuniao Rapida">
              <button
                onClick={() => createInstant()}
                disabled={creating}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mx-auto"
              >
                <Zap className="h-4 w-4" />
              </button>
            </SidebarTooltip>
          </>
        ) : (
          <>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Nova Reuniao
            </button>
            <button
              onClick={() => createInstant()}
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Zap className="h-4 w-4" /> Reuniao Rapida
            </button>
          </>
        )}
        <CreateMeetingDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarItem
                  key={item.url}
                  item={item}
                  collapsed={collapsed}
                  active={location.pathname === item.url || (item.url === '/dashboard' && location.pathname === '/')}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-border/50 space-y-0.5 shrink-0">
        {bottomItems.map((item) => (
          <SidebarItem
            key={item.url}
            item={item}
            collapsed={collapsed}
            active={location.pathname === item.url}
          />
        ))}
        {collapsed && (
          <SidebarTooltip label="Expandir">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mx-auto mt-1"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </SidebarTooltip>
        )}
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  collapsed,
  active,
}: {
  item: { title: string; url: string; icon: LucideIcon };
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;

  const content = (
    <NavLink
      to={item.url}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150',
        collapsed && 'justify-center px-0 py-2',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary transition-all" />
      )}
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-primary')} />
      {!collapsed && <span>{item.title}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <SidebarTooltip label={item.title}>
        {content}
      </SidebarTooltip>
    );
  }

  return content;
}

function SidebarTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
