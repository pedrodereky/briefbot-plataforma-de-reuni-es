import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { MobileNavProvider } from './MobileNav';
import { MobileTabBar } from './MobileTabBar';

export function AppLayout() {
  return (
    <MobileNavProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        {/* Sem padding: cada página abre com o próprio PageHeader, que vai de
            ponta a ponta e fecha com uma linha. O respiro entra depois, no
            PageBody. O pb no celular é o espaço da barra de abas, que é fixa. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-auto pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
    </MobileNavProvider>
  );
}
