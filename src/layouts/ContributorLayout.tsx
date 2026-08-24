import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotificationBell from '@/components/app/NotificationBell';
import { getFirstName } from '@/lib/displayName';
import {
  LayoutGrid,
  ClipboardList,
  User,
  Wallet,
  LogOut,
  Database,
  BookOpen,
} from 'lucide-react';

const navItems = [
  { to: '/app/tasks', icon: Database, label: 'My Projects' },
  { to: '/app/submissions', icon: ClipboardList, label: 'My Work' },
  { to: '/app/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/app/profile', icon: User, label: 'Profile' },
];

export function ContributorLayout() {
  const { signOut, profile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnboarding = location.pathname.includes('/onboarding');
  const isTaskExecution = location.pathname.includes('/app/task/');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth/login');
  };

  if (isOnboarding || isTaskExecution) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F9FA]">
      {/* Desktop Sidebar (matches AdminLayout) */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-[#0A1628] bg-[#0A1628] lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-6">
          <Database className="h-5 w-5 text-[#06B6D4]" />
          <span className="font-display text-base font-bold text-white">data.deepannotate.ai</span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3 pr-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/app/tasks'}
              className={({ isActive }) =>
                `flex items-center gap-3 py-2.5 px-3.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[rgba(6,182,212,0.12)] text-[#06B6D4] border-l-2 border-[#06B6D4] rounded-r-lg rounded-l-none'
                    : 'text-[rgba(255,255,255,0.65)] hover:bg-white/5 hover:text-white rounded-r-lg rounded-l-none border-l-2 border-transparent'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 bg-[#0A1628] p-3 space-y-2">
          <button
            type="button"
            onClick={() => navigate('/app/profile')}
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-white/5 cursor-pointer"
          >
            <Avatar className="h-8 w-8 shrink-0" key={profile?.avatar_url || 'no-avatar'}>
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="bg-[rgba(6,182,212,0.15)] text-[#06B6D4] text-xs font-display font-bold">
                {(profile?.display_name || 'C').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.display_name || 'Contributor'}
              </p>
              <p className="text-[10px] text-[rgba(255,255,255,0.4)] truncate">
                {profile?.email || ''}
              </p>
            </div>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[rgba(255,255,255,0.4)] hover:bg-white/5 hover:text-white"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-x-hidden min-h-screen bg-[#F7F9FA]">
        {/* Mobile Header */}
        <header className="flex h-14 items-center justify-between border-b border-[#0A1628] bg-[#0A1628] px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#06B6D4]" />
            <span className="font-display text-base font-bold text-white">data.deepannotate.ai</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/app/profile')}
              className="flex items-center gap-2 rounded-full p-1 cursor-pointer"
            >
              <Avatar className="h-7 w-7" key={profile?.avatar_url || 'no-avatar'}>
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="bg-[rgba(6,182,212,0.15)] text-[#06B6D4] text-[10px] font-display font-bold">
                  {(profile?.display_name || 'C').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-[rgba(255,255,255,0.4)] hover:text-white">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 pb-24 lg:pb-6 bg-[#F7F9FA]">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#E5E7EB] bg-white lg:hidden"
          style={{
            boxShadow: '0 -2px 10px rgba(0,0,0,0.03)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/app/tasks'}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-[#06B6D4] font-semibold' : 'text-[#6B7280]'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
