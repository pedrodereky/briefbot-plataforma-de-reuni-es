import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';

export type Papel = 'owner' | 'admin' | 'member';

export interface Membro {
  user_id: string;
  papel: Papel;
  email: string | null;
  nome: string | null;
  criado_em: string;
}

export interface Equipe {
  organizacao: { id: string; nome: string } | null;
  meu_papel: Papel;
  membros: Membro[];
}

/**
 * A organização de quem está logado, com a equipe.
 *
 * Mesma chave de cache da aba Equipe: quem abrir as duas telas não dispara a
 * chamada duas vezes.
 */
export function useMinhaOrganizacao() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['equipe'],
    queryFn: async (): Promise<Equipe> => {
      const { data, error } = await supabase.functions.invoke('manage-team', {
        body: { acao: 'listar' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as Equipe;
    },
    enabled: !!user,
  });
}
