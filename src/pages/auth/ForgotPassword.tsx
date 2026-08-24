import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, ArrowLeft, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

const RESET_REDIRECT_URL = `${window.location.origin}/reset-password`;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendResetEmail = async (targetEmail: string) => {
    await sendPasswordResetEmail(firebaseAuth, targetEmail, {
      url: RESET_REDIRECT_URL,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setIsLoading(true);
    try {
      await sendResetEmail(email);
      setSent(true);
      setCooldown(30);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send reset email',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsResending(true);
    try {
      await sendResetEmail(email);
      setCooldown(30);
      toast({
        title: 'New reset link sent',
        description: 'Please use the latest email. Previous links will no longer work.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to resend email',
      });
    } finally {
      setIsResending(false);
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

        {sent ? (
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              A new password reset link has been sent to <span className="font-medium text-foreground">{email}</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              If you requested multiple times, please use the latest email. Previous links will no longer work.
            </p>
            <p className="text-xs text-muted-foreground">
              Don't see it? Check your spam or junk folder.
            </p>
            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={isResending || cooldown > 0}
              >
                {isResending
                  ? 'Resending...'
                  : cooldown > 0
                  ? `Resend Email (${cooldown}s)`
                  : 'Resend Email'}
              </Button>
              <Link to="/auth/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">Forgot password?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || cooldown > 0}>
                {isLoading
                  ? 'Sending...'
                  : cooldown > 0
                  ? `Send Reset Link (${cooldown}s)`
                  : 'Send Reset Link'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remember your password?{' '}
              <Link to="/auth/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
