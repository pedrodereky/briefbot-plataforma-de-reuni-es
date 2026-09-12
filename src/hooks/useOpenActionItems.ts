import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';

/**
 * Quantos action items ainda estão abertos.
 *
 * Mesma chave de cache usada pelo painel: com o dashboard aberto, o selo do
 * menu lateral não dispara requisição nenhuma — o React Query devolve o valor
 * que já está em memória.
 */
export function useOpenActionItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action_items_open', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('action_items')
        .select('*', { count: 'exact', head: true })
        .eq('done', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });
}
