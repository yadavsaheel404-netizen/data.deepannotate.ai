import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export default function Unauthorized() {
  const { user, role } = useAuthStore();
  const navigate = useNavigate();

  const handleGoHome = () => {
    if (!user) {
      navigate('/auth/login', { replace: true });
    } else if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'contributor') {
      navigate('/app/guidelines', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <ShieldX className="h-16 w-16 text-destructive" />
      <h1 className="mt-4 font-display text-3xl font-bold">Access Denied</h1>
      <p className="mt-2 text-muted-foreground">You don't have permission to access this page.</p>
      <Button variant="outline" className="mt-6" onClick={handleGoHome}>
        Go Home
      </Button>
    </div>
  );
}
