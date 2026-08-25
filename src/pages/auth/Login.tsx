import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { signInWithEmailAndPassword, sendEmailVerification, signOut as signOutFirebase } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import logoImg from '@/assets/logo.png';
import { Globe, ChevronDown, AlertCircle } from 'lucide-react';

function getAuthErrorMessage(code: string, rawMsg: string): { title: string; description: string } {
  const normalizedCode = (code || '').toLowerCase();

  if (normalizedCode === 'auth/user-not-found' || normalizedCode.includes('user-not-found')) {
    return {
      title: 'No Account Found',
      description: 'No account exists with this email address. Please check your spelling or sign up.',
    };
  }

  if (normalizedCode === 'auth/wrong-password' || normalizedCode.includes('wrong-password')) {
    return {
      title: 'Incorrect Password',
      description: 'The password you entered is incorrect. Try again or reset it.',
    };
  }

  if (
    normalizedCode === 'auth/invalid-credential' ||
    normalizedCode.includes('invalid-credential') ||
    normalizedCode.includes('invalid-login-credentials')
  ) {
    return {
      title: 'Incorrect Credentials',
      description: 'No account found with these credentials, or password is incorrect.',
    };
  }

  if (normalizedCode === 'auth/too-many-requests' || normalizedCode.includes('too-many-requests')) {
    return {
      title: 'Too Many Failed Attempts',
      description: 'Access to this account has been temporarily disabled. Please wait a moment and try again or reset your password.',
    };
  }

  if (normalizedCode === 'auth/invalid-email' || normalizedCode.includes('invalid-email')) {
    return {
      title: 'Invalid Email Format',
      description: 'Please enter a valid email address (e.g. user@example.com).',
    };
  }

  return {
    title: 'Sign In Failed',
    description: 'Incorrect email or password. Please verify your credentials and try again.',
  };
}

export default function Login() {
  const prefilledEmail = (useLocation().state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [formError, setFormError] = useState<{ title: string; description: string } | null>(null);
  const { signInWithEmail, signInWithGoogle, user, role, initialized } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const queryParams = new URLSearchParams(location.search);
  const isResetSuccess = queryParams.get('reset') === 'success';
  const isVerifiedReturn = queryParams.get('verified') === 'true';
  const flashMessage =
    (location.state as { message?: string } | null)?.message ??
    (isResetSuccess ? 'Password updated successfully. Please sign in.' : null) ??
    (isVerifiedReturn ? 'Email verified successfully! Please sign in to your account.' : null);
  const [banner, setBanner] = useState<string | null>(flashMessage);

  useEffect(() => {
    if (flashMessage) {
      window.history.replaceState({}, '', '/auth/login');
    }
  }, [flashMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (isResetSuccess || isVerifiedReturn) return;
    if (user && role) {
      navigate('/', { replace: true });
    }
  }, [initialized, user, role, navigate, isResetSuccess, isVerifiedReturn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);
    try {
      const fbUser = await signInWithEmail(email, password);

      const isGoogleUser = fbUser?.providerData?.some((p) => p.providerId === 'google.com');
      if (!isGoogleUser && !fbUser.emailVerified) {
        await signOutFirebase(firebaseAuth);
        const verifyMessage = `Please verify your email address before logging in. We've sent a verification link to ${email}.`;
        toast({
          variant: 'destructive',
          title: 'Email Verification Required',
          description: verifyMessage,
        });
        navigate('/auth/verify-email', {
          state: {
            email,
            message: verifyMessage,
          },
        });
        return;
      }

      navigate('/', { replace: true });
    } catch (error: any) {
      const errDetails = getAuthErrorMessage(error?.code || '', error?.message || '');
      setFormError(errDetails);
      toast({
        variant: 'destructive',
        title: errDetails.title,
        description: errDetails.description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email || !password) {
      toast({
        variant: 'destructive',
        title: 'Email and password required',
        description: 'Please enter your email and password above to request verification.',
      });
      return;
    }
    setResending(true);
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      await sendEmailVerification(cred.user);
      await signOutFirebase(firebaseAuth);
      toast({
        title: 'Verification email sent',
        description: `We've sent a new verification link to ${email}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not resend',
        description: error.message || 'Please try again in a moment.',
      });
    } finally {
      setResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google sign in failed',
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between items-center bg-white text-slate-900 overflow-x-hidden font-sans selection:bg-[#0BA8D3]/20">
      {/* Top Cyan Ambient Aurora Light Bar - Centered in Middle */}
      <div className="absolute top-0 left-0 right-0 h-[180px] overflow-hidden pointer-events-none z-0">
        {/* Centered Glowing Cyan Radial Arch */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[550px] sm:w-[680px] h-[220px] rounded-full bg-gradient-to-b from-[#0BA8D3]/45 via-[#06B6D4]/35 to-transparent opacity-90 filter blur-[50px] sm:blur-[65px] animate-aurora-1" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/20 to-white animate-aurora-2" />
      </div>

      {/* Centered Content Column starting ~15% from top */}
      <div className="relative z-10 w-full max-w-[400px] px-5 pt-14 sm:pt-20 pb-8 my-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full flex flex-col items-center"
        >
          {/* 1. Logo: Clean raw logo image without dark card container */}
          <div className="h-[76px] w-[76px] flex items-center justify-center mb-6 shrink-0">
            <img src={logoImg} alt="DeepAnnotate Logo" className="h-full w-full object-contain" />
          </div>

          {/* 2. Heading: Neutral for both login and signup */}
          <h1 className="font-display text-3xl sm:text-[34px] font-extrabold text-[#0E1F3E] tracking-tight text-center mb-6">
            Log in or sign up
          </h1>

          {/* Banner Notifications */}
          {banner && (
            <div
              role="status"
              className="w-full mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-[#0E1F3E]"
            >
              <div className="flex items-start justify-between gap-2">
                <span>{banner}</span>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Form Error Banner */}
          {formError && (
            <div
              role="alert"
              className="w-full mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-rose-700 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {formError.title}
                </p>
                <button
                  type="button"
                  onClick={() => setFormError(null)}
                  className="text-rose-400 hover:text-rose-700 text-xs font-bold"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
              <p className="text-rose-600/90 leading-relaxed text-[11px]">
                {formError.description}
              </p>
            </div>
          )}

          {/* 3 & 4. Inputs & Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            {/* Email Input */}
            <div className="space-y-1">
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-12 px-4 bg-[#f2f2f2] border-0 focus-visible:ring-2 focus-visible:ring-[#0BA8D3] focus-visible:bg-white rounded-[10px] text-sm text-slate-900 placeholder:text-slate-400 transition-all shadow-none"
              />
            </div>

            {/* Password Input with Forgot password link */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-0.5 mb-1">
                <span className="text-xs text-slate-500 font-medium">Password</span>
                <Link
                  to="/auth/forgot-password"
                  className="text-xs font-semibold text-[#0BA8D3] hover:text-[#0883A6] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-12 px-4 bg-[#f2f2f2] border-0 focus-visible:ring-2 focus-visible:ring-[#0BA8D3] focus-visible:bg-white rounded-[10px] text-sm text-slate-900 placeholder:text-slate-400 transition-all shadow-none"
              />
            </div>

            {/* 5. Sign In Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#0E1F3E] hover:bg-[#081327] text-white font-bold rounded-[10px] shadow-sm transition-all text-sm mt-2 cursor-pointer border-0"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>

            {needsVerification && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs mt-3"
              >
                <p className="font-semibold text-amber-900">Please verify your email before logging in.</p>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Check your inbox for the link.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 text-[11px] h-7 border-amber-300 bg-white hover:bg-amber-100/50"
                  onClick={handleResendVerification}
                  disabled={resending}
                >
                  {resending ? 'Sending...' : 'Resend email'}
                </Button>
              </div>
            )}
          </form>

          {/* 6. Divider */}
          <div className="relative w-full my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400 font-medium">or continue with</span>
            </div>
          </div>

          {/* 7. Continue with Google Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            className="w-full h-12 bg-white hover:bg-slate-50/80 border border-slate-200 text-slate-700 font-semibold rounded-[10px] shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-3 text-sm cursor-pointer"
          >
            <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </Button>

          {/* 8. Sign Up Link */}
          <p className="mt-5 text-center text-xs text-slate-500 font-medium">
            Don't have an account?{' '}
            <Link to="/auth/signup" className="font-semibold text-[#0BA8D3] hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>

      {/* 9. Small gray centered legal text at very bottom of page */}
      <footer className="relative z-10 w-full text-center py-6 px-4 shrink-0">
        <p className="text-[11px] text-slate-400 leading-normal max-w-sm mx-auto">
          By continuing, you agree to our{' '}
          <a href="#" className="text-[#0BA8D3] hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-[#0BA8D3] hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
