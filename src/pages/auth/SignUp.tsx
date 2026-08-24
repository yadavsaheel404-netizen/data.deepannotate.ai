import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, CheckCircle2, Mail, Lock, User, ShieldCheck, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { AuthHeroPanel } from '@/components/auth/AuthHeroPanel';
import { DeepAnnotateLogo } from '@/components/auth/DeepAnnotateLogo';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState(false);
  const { signUp, signInWithGoogle } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const MIN_LENGTH = 6;
  const isPasswordValid = password.length >= MIN_LENGTH;

  const goToSignIn = () => {
    navigate('/auth/login', { state: { email } });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setDuplicateError(false);

    if (!isPasswordValid) {
      setPasswordError(`Please enter a valid password (minimum ${MIN_LENGTH} characters)`);
      return;
    }

    setIsLoading(true);
    try {
      await signUp(email, password, displayName);
      navigate('/auth/verify-email', { state: { email } });
    } catch (error: any) {
      const msg: string = error?.message || '';
      const code: string = error?.code || '';
      if (
        /already registered|already exists|email-already-in-use/i.test(msg) ||
        code === 'auth/email-already-in-use'
      ) {
        setDuplicateError(true);
        return;
      }
      if (
        code === 'auth/weak-password' ||
        code === 'weak_password' ||
        /password/i.test(msg)
      ) {
        setPasswordError(`Please enter a valid password (minimum ${MIN_LENGTH} characters)`);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: msg || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google sign up failed',
        description: error.message,
      });
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center bg-white rounded-3xl p-8 sm:p-10 shadow-lg border border-slate-100"
        >
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h2 className="mt-4 font-display text-2xl font-extrabold text-[#0B1E48]">Check your email</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            We've sent a confirmation link to <strong className="text-slate-800">{email}</strong>. Click it to activate your account.
          </p>
          <Link to="/auth/login">
            <Button className="mt-6 bg-[#0B1E48] hover:bg-[#061434] text-white font-bold h-11 px-6 rounded-xl">
              Back to Login
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Left panel - Hero branding matching Image 1 & 3 */}
      <AuthHeroPanel />

      {/* Right panel - Single Viewport Form */}
      <div className="flex flex-1 flex-col items-center justify-between p-4 sm:p-6 lg:py-6 lg:px-8 h-screen max-h-screen overflow-hidden">
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
              Create your account
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Join as a data contributor</p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-2.5">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Display Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500" />
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="pl-9 h-10 text-xs border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20 rounded-xl bg-slate-50/50 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

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
                <Label htmlFor="password" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    required
                    minLength={6}
                    className="pl-9 h-10 text-xs border-slate-200 focus:border-[#0284C7] focus:ring-[#0284C7]/20 rounded-xl bg-slate-50/50 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                {passwordError && (
                  <p className="text-[11px] text-rose-500 font-medium mt-0.5">{passwordError}</p>
                )}
              </div>

              {duplicateError && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-1.5"
                >
                  <p className="font-semibold text-amber-900">
                    An account with this email already exists.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-7 border-amber-300 bg-white hover:bg-amber-100/50"
                    onClick={goToSignIn}
                  >
                    Go to Sign In
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading || !isPasswordValid}
                className="w-full h-11 bg-[#0B1E48] hover:bg-[#061434] text-white font-bold rounded-xl shadow-md shadow-[#0B1E48]/10 transition-all flex items-center justify-center gap-2 text-xs mt-4 cursor-pointer"
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
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
              onClick={handleGoogleSignUp}
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
              Already have an account?{' '}
              <Link to="/auth/login" className="font-semibold text-[#0284C7] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Bottom Feature Badges & Copyright Footer */}
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
