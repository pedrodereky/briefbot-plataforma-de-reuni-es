import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRealtimeBriefings } from '@/hooks/useRealtimeBriefings';
import { useEnsureAuthTrigger } from '@/hooks/useEnsureAuthTrigger';

export function AppHooks() {
  useDocumentTitle();
  useRealtimeBriefings();
  useEnsureAuthTrigger();
  return null;
}
