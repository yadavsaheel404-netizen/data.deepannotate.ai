import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { signInWithEmailAndPassword, sendEmailVerification, signOut as signOutFirebase } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowRight, Mail, Lock, ShieldCheck, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { AuthHeroPanel } from '@/components/auth/AuthHeroPanel';
import { DeepAnnotateLogo } from '@/components/auth/DeepAnnotateLogo';

function getAuthErrorMessage(code: string, rawMsg: string): { title: string; description: string } {
  const normalizedCode = (code || '').toLowerCase();
  const normalizedMsg = (rawMsg || '').toLowerCase();

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
    <div className="flex h-screen max-h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Left panel - Hero branding matching Image 1 & 3 */}
      <AuthHeroPanel />

      {/* Right panel - Single viewport Card & Footer Badges */}
      <div className="flex flex-1 flex-col items-center justify-between p-4 sm:p-6 lg:py-6 lg:px-8 h-screen max-h-screen overflow-hidden">
        {/* Top Spacer */}
        <div className="shrink-0 h-1" />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md my-auto"
        >
          {/* Card Container */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(11,30,72,0.05)] border border-slate-100/90">
            {/* Mobile Header Logo */}
            <div className="mb-4 lg:hidden">
              <DeepAnnotateLogo />
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B1E48] tracking-tight">
              Welcome back
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Sign in to your account</p>

            {banner && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-[#0B1E48]"
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

            {formError && (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1"
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

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 h-10 text-xs border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20 rounded-xl bg-slate-50/50 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Password
                  </Label>
                  <Link to="/auth/forgot-password" className="text-xs text-[#0284C7] font-semibold hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9 h-10 text-xs border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20 rounded-xl bg-slate-50/50 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#0B1E48] hover:bg-[#061434] text-white font-bold rounded-xl shadow-md shadow-[#0B1E48]/10 transition-all flex items-center justify-center gap-2 text-xs mt-5 cursor-pointer"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>

              {needsVerification && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs mt-2"
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

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200/80" />
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="bg-white px-2.5 text-slate-400 font-medium">or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2.5 text-xs cursor-pointer"
              onClick={handleGoogleSignIn}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>

            <p className="mt-4 text-center text-xs text-slate-500">
              Don't have an account?{' '}
              <Link to="/auth/signup" className="font-semibold text-[#0284C7] hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Bottom Feature Badges & Copyright Footer (Matching Image 3) */}
        <div className="w-full max-w-md shrink-0 border-t border-slate-200/80 pt-3 pb-1 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-sky-100/70 text-[#0284C7] flex items-center justify-center shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-[11px] text-[#0B1E48] leading-tight">Global Community</h4>
                <p className="text-[10px] text-slate-500 leading-tight">190+ countries</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-sky-100/70 text-[#0284C7] flex items-center justify-center shrink-0">
                <Lock className="h-3.5 w-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-[11px] text-[#0B1E48] leading-tight">Fair & Transparent</h4>
                <p className="text-[10px] text-slate-500 leading-tight">Real rewards</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-sky-100/70 text-[#0284C7] flex items-center justify-center shrink-0">
                <Users className="h-3.5 w-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-[11px] text-[#0B1E48] leading-tight">Built for Annotators</h4>
                <p className="text-[10px] text-slate-500 leading-tight">By annotators</p>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400">
            © 2026 data.deepannotate.ai. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
