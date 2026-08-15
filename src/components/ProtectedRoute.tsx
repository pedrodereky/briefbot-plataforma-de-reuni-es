import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthProvider';
import { Loader2 } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, user, loading } = useAuth();
  const location = useLocation();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['user_settings_onboarding', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('onboarding_completed_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 min
  });

  if (loading || settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to onboarding if not completed (except if already on onboarding page)
  const isOnboardingRoute = location.pathname === '/onboarding';
  if (!isOnboardingRoute && !settings?.onboarding_completed_at) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
