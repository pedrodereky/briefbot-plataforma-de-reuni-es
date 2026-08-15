import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';

export type ServiceGroup = 'livekit' | 'deepgram' | 'resend';

const REQUIRED_BY_GROUP: Record<ServiceGroup, string[]> = {
  livekit: ['livekit_api_key', 'livekit_api_secret', 'livekit_url'],
  deepgram: ['deepgram_api_key'],
  resend: ['resend_api_key'],
};

export function useRequiredKeys() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['api_keys_registry', user?.id],
    queryFn: async () => {
      if (!user) return [] as { service_name: string; is_active: boolean }[];
      const { data, error } = await supabase
        .from('api_keys_registry')
        .select('service_name, is_active')
        .eq('user_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const configured = new Set(
    (query.data ?? []).filter((r) => r.is_active).map((r) => r.service_name)
  );

  const has = (group: ServiceGroup) =>
    REQUIRED_BY_GROUP[group].every((s) => configured.has(s));

  return {
    isLoading: query.isLoading,
    has,
    missing: (groups: ServiceGroup[]) => groups.filter((g) => !has(g)),
  };
}