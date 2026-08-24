import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { AppRole } from '@/types/user';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  fallback?: string;
}

export function RoleGuard({ children, allowedRoles, fallback = '/auth/login' }: RoleGuardProps) {
  const { user, role, loading, initialized } = useAuthStore();

  // Wait for auth init AND, if a user exists, for role fetch to complete.
  // This prevents a flash of "Access Denied" on refresh while role is loading.
  if (!initialized || loading || (user && role === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={fallback} replace />;
  }

  if (!allowedRoles.includes(role!)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
