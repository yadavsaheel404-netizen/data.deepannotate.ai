import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { sendEmailVerification, signInWithEmailAndPassword, signOut as signOutFirebase } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, Mail, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const stateEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(stateEmail);
  const [password, setPassword] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;

    if (!email || !password) {
      toast({
        variant: 'destructive',
        title: 'Credentials required to resend',
        description: 'Please enter your email and password to send a new verification link.',
      });
      return;
    }

    setIsResending(true);
    try {
      // Temporarily authenticate user to resend verification email, then sign out
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const actionCodeSettings = {
        url: `${window.location.origin}/auth/login?verified=true`,
        handleCodeInApp: false,
      };
      await sendEmailVerification(cred.user, actionCodeSettings);
      await signOutFirebase(firebaseAuth);

      toast({
        title: 'Verification link sent',
        description: `A fresh verification link has been sent to ${email}.`,
      });
      setCooldown(60);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not resend verification email',
        description: error.message || 'Please check your email and password.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const stateMessage = (location.state as { email?: string; message?: string } | null)?.message ?? '';

  useEffect(() => {
    if (stateMessage) {
      toast({
        variant: 'destructive',
        title: 'Email Verification Required',
        description: stateMessage,
      });
    }
  }, [stateMessage, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center space-y-6"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-7 w-7" />
        </div>

        {stateMessage && (
          <div
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-xs text-left text-foreground space-y-1"
          >
            <p className="font-semibold text-warning flex items-center gap-1.5">
              ⚠️ Email Verification Required
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {stateMessage}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            We sent a verification link to{' '}
            <span className="font-semibold text-foreground">{email || 'your email address'}</span>.
            Please click the link in your inbox to activate your account.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 text-left space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Need a new link?
          </div>

          <div className="space-y-3">
            {!stateEmail && (
              <div className="space-y-1 text-left">
                <Label htmlFor="verify-email" className="text-xs">Email</Label>
                <Input
                  id="verify-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1 text-left">
              <Label htmlFor="verify-password" className="text-xs">Password (for security check)</Label>
              <Input
                id="verify-password"
                type="password"
                placeholder="Enter account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isResending ? 'animate-spin' : ''}`} />
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : isResending
                ? 'Sending link...'
                : 'Resend Verification Email'}
            </Button>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            className="w-full sm:w-auto gap-2"
            onClick={() => navigate('/auth/login', { state: { email } })}
          >
            I've Verified, Continue to Sign In <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
