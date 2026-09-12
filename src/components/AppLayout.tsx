import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { MobileNavProvider } from './MobileNav';

export function AppLayout() {
  return (
    <MobileNavProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        {/* Sem padding: cada página abre com o próprio PageHeader, que vai de
            ponta a ponta e fecha com uma linha. O respiro entra depois, no
            PageBody. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </MobileNavProvider>
  );
}
