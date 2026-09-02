import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";
import Login from "./pages/auth/Login";
import SignUp from "./pages/auth/SignUp";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import AuthCallback from "./pages/auth/AuthCallback";

import { AdminLayout } from "./layouts/AdminLayout";
import { ContributorLayout } from "./layouts/ContributorLayout";
import { RoleGuard } from "./components/shared/RoleGuard";

import AdminDashboard from "./pages/admin/Dashboard";
import AdminTasks from "./pages/admin/Tasks";
import CreateTask from "./pages/admin/CreateTask";
import AdminReview from "./pages/admin/Review";
import ReviewTask from "./pages/admin/ReviewTask";
import WalletPage from "./pages/app/Wallet";
import AdminContributors from "./pages/admin/Contributors";
import ContributorDetail from "./pages/admin/ContributorDetail";
import AdminAnalytics from "./pages/admin/Analytics";
import Communications from "./pages/admin/Communications";
import TaskFeed from "./pages/app/TaskFeed";
import TaskExecution from "./pages/app/TaskExecution";
import TaskInstructions from "./pages/app/TaskInstructions";
import MySubmissions from "./pages/app/MyTasks";
import Profile from "./pages/app/Profile";
import GuidelinesDetail from "./pages/app/GuidelinesDetail";
import SubmitTask from "./pages/app/SubmitTask";
import AnnotateTask from "./pages/app/AnnotateTask";
import Payments from "./pages/admin/Payments";
import AdminPayouts from "./pages/admin/Payouts";
import WithdrawRequests from "./pages/admin/WithdrawRequests";
import CompleteProfile from "./pages/app/CompleteProfile";
import AdminSupport from "./pages/admin/Support";
import AdminSettings from "./pages/admin/Settings";
import VerifyEmail from "./pages/auth/VerifyEmail";
import TwoFactorGate from "./components/auth/TwoFactorGate";

const queryClient = new QueryClient();

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const twoFactorPending = useAuthStore((s) => s.twoFactorPending);
  const navigate = useNavigate();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (twoFactorPending) {
    return <TwoFactorGate />;
  }

  const hasFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

  return (
    <>
      {!hasFirebase && (
        <div className="bg-amber-500 text-foreground px-4 py-2.5 text-center text-xs font-bold border-b border-amber-600/40 relative z-50 flex items-center justify-center gap-2 shadow-sm">
          <span>⚠️ Firebase is not configured! Please specify VITE_FIREBASE_API_KEY, etc. inside your .env file to enable authentication and logins.</span>
        </div>
      )}
      {children}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthInitializer>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<SignUp />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/auth/update-password" element={<ResetPassword />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />

            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <AdminLayout />
                </RoleGuard>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="tasks" element={<AdminTasks />} />
              <Route path="create-task" element={<CreateTask />} />
              <Route path="review" element={<AdminReview />} />
              <Route path="review/:taskId" element={<ReviewTask />} />
              <Route path="contributors" element={<AdminContributors />} />
              <Route path="contributors/:userId" element={<ContributorDetail />} />
              <Route path="communications" element={<Communications />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="payments" element={<Payments />} />
              <Route path="payouts" element={<AdminPayouts />} />
              <Route path="withdrawals" element={<WithdrawRequests />} />
              <Route path="support" element={<AdminSupport />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* Contributor routes */}
            <Route
              path="/app"
              element={
                <RoleGuard allowedRoles={['contributor']}>
                  <ContributorLayout />
                </RoleGuard>
              }
            >
              {/* Redirect /app to /app/tasks */}
              <Route index element={<Navigate to="/app/tasks" replace />} />
              <Route path="guidelines/:slug" element={<GuidelinesDetail />} />
              <Route path="tasks" element={<TaskFeed />} />
              <Route path="task/:taskId" element={<TaskExecution />} />
              <Route path="task/:taskId/guidelines" element={<GuidelinesDetail />} />
              <Route path="task/:taskId/instructions" element={<TaskInstructions />} />
              <Route path="task/:taskId/submit" element={<SubmitTask />} />
              <Route path="task/:taskId/annotate" element={<AnnotateTask />} />
              <Route path="submissions" element={<MySubmissions />} />
              <Route path="profile" element={<Profile />} />
              <Route path="wallet" element={<WalletPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthInitializer>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
