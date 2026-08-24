import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const oobCode = searchParams.get('oobCode');
    const mode = searchParams.get('mode');

    if (!oobCode || !mode) {
      // Fallback: If landed here without params, redirect to home
      navigate('/', { replace: true });
      return;
    }

    const handleAction = async () => {
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(firebaseAuth, oobCode);
          toast({
            title: 'Email verified successfully 🎉',
            description: 'You can now log in with your email and password.',
          });
          navigate('/auth/login', { replace: true, state: { message: 'Email verified successfully. Please log in.' } });
        } else if (mode === 'resetPassword') {
          navigate(`/reset-password?mode=resetPassword&oobCode=${oobCode}`, { replace: true });
        } else {
          // Unknown mode, redirect to login
          navigate('/auth/login', { replace: true });
        }
      } catch (error: any) {
        console.error('Firebase Auth Action Handler failed:', error);
        setErrorMsg(error.message || 'Verification link expired or invalid');
        toast({
          variant: 'destructive',
          title: 'Action failed',
          description: error.message || 'The authentication link is invalid or has expired.',
        });
        setTimeout(() => {
          navigate('/auth/login', { replace: true });
        }, 3000);
      }
    };

    handleAction();
  }, [navigate, searchParams, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {errorMsg ? (
            <span className="text-destructive font-medium">{errorMsg}. Redirecting...</span>
          ) : (
            'Processing account action...'
          )}
        </p>
      </div>
    </div>
  );
}
