import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, profile, role, loading, initialized } = useAuthStore();
  const navigate = useNavigate();

  // Force-logout inactive contributors on session restore.
  // Admins bypass this check.
  useEffect(() => {
    if (!initialized || loading) return;
    if (!user || !profile) return;
    if (role === 'admin') return;
    if ((profile as any).is_active === false) {
      (async () => {
        await supabase.auth.signOut();
        useAuthStore.setState({ user: null, session: null, profile: null, role: null });
        toast.error('Your account is inactive. Contact support.');
        navigate('/auth/login', { replace: true });
      })();
    }
  }, [user, profile, role, loading, initialized, navigate]);

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // Block render while signing out an inactive contributor
  if (profile && role !== 'admin' && (profile as any).is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
