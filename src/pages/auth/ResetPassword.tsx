import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

type LinkState = 'checking' | 'valid' | 'invalid';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      const url = new URL(window.location.href);
      const oobCode = url.searchParams.get('oobCode');
      const mode = url.searchParams.get('mode');

      if (oobCode && mode === 'resetPassword') {
        try {
          await verifyPasswordResetCode(firebaseAuth, oobCode);
          if (cancelled) return;
          setLinkState('valid');
        } catch (error) {
          if (cancelled) return;
          setLinkState('invalid');
        }
      } else {
        setLinkState('invalid');
      }
    };

    validate();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same.',
      });
      return;
    }
    if (password.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'Password must be at least 8 characters.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const url = new URL(window.location.href);
      const oobCode = url.searchParams.get('oobCode');
      if (!oobCode) {
        throw new Error('Verification code is missing from link');
      }
      
      await confirmPasswordReset(firebaseAuth, oobCode, password);

      setSuccess(true);
      toast({ title: 'Password updated successfully' });

      // Brief success state, then redirect to login with ?reset=success flag.
      setTimeout(() => {
        navigate('/auth/login?reset=success', { replace: true });
      }, 1500);
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      let friendly = 'Failed to reset password. Please try again.';
      if (msg.includes('expired') || msg.includes('invalid')) {
        friendly = 'This reset link has expired. Please request a new one.';
      } else if (msg.includes('weak') || msg.includes('short')) {
        friendly = 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.';
      } else if (msg.includes('same')) {
        friendly = 'New password must be different from your current password.';
      }
      toast({ variant: 'destructive', title: 'Error', description: friendly });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-bold">DataForge</span>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold">Password updated successfully</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you to sign in...
            </p>
          </div>
        ) : linkState === 'checking' ? (
          <div className="space-y-3">
            <h2 className="font-display text-2xl font-bold">Verifying link...</h2>
            <p className="text-sm text-muted-foreground">Just a moment.</p>
          </div>
        ) : linkState === 'invalid' ? (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold">This reset link is no longer valid</h2>
            <p className="text-sm text-muted-foreground">
              You may have requested a newer link. Please check your latest email or request a new one.
            </p>
            <Button className="w-full" onClick={() => navigate('/auth/forgot-password')}>
              Request New Link
            </Button>
            <Link to="/auth/login">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">Set new password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your new password below.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Reset Password'}
              </Button>
              <Link to="/auth/login">
                <Button type="button" variant="ghost" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
