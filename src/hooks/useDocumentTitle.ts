import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TITLES: Record<string, string> = {
  '/': 'Dashboard — BriefBot',
  '/dashboard': 'Dashboard — BriefBot',
  '/meetings': 'Reuniões — BriefBot',
  '/action-items': 'Action Items — BriefBot',
  '/settings': 'Configurações — BriefBot',
  '/login': 'Login — BriefBot',
};

export function useDocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const base = pathname.startsWith('/meetings/') ? 'Reunião — BriefBot' : TITLES[pathname];
    document.title = base ?? 'BriefBot';
  }, [pathname]);
}
