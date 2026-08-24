import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, Database } from 'lucide-react';

export default function Index() {
  const { user, role, profile, loading, initialized } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized || loading) return;

    // Don't auto-route during password recovery — the user must complete
    // the reset flow and then sign in manually.
    const hash = window.location.hash || '';
    if (hash.includes('type=recovery')) {
      navigate('/reset-password' + hash, { replace: true });
      return;
    }

    if (!user) {
      navigate('/auth/login', { replace: true });
      return;
    }

    // Wait for role to be fetched before redirecting
    if (!role) return;

    if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/app/tasks', { replace: true });
    }
  }, [user, role, profile, loading, initialized, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <Database className="h-10 w-10 text-primary animate-pulse" />
      <Loader2 className="mt-4 h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
