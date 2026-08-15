import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function TopBar() {
  const { user, signOut } = useAuth();

  const name = user?.user_metadata?.full_name ?? user?.email ?? '';
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex h-14 items-center justify-end border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
          {name && <span className="text-sm text-muted-foreground hidden sm:inline">{name.split('@')[0]}</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-muted-foreground hover:text-foreground h-8">
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>
    </header>
  );
}
