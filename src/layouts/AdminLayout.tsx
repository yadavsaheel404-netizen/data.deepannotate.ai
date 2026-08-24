import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ListTodo,
  ClipboardCheck,
  Users,
  BarChart3,
  IndianRupee,
  Wallet,
  LogOut,
  Database,
  MessageSquare,
  LifeBuoy,
} from 'lucide-react';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/tasks', icon: ListTodo, label: 'Projects' },
  { to: '/admin/review', icon: ClipboardCheck, label: 'Review' },
  { to: '/admin/contributors', icon: Users, label: 'Contributors' },
  { to: '/admin/communications', icon: MessageSquare, label: 'Communications' },
  { to: '/admin/payments', icon: IndianRupee, label: 'Payments' },
  { to: '/admin/withdrawals', icon: Wallet, label: 'Withdrawals' },
  { to: '/admin/payouts', icon: Wallet, label: 'Payouts' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin/support', icon: LifeBuoy, label: 'Support' },
];

export function AdminLayout() {
  const { signOut, profile } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FA]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-[#0A1628] bg-[#0A1628] lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-6">
          <Database className="h-5 w-5 text-[#06B6D4]" />
          <span className="font-display text-base font-bold text-white">data.deepannotate.ai</span>
          <span className="ml-auto rounded bg-[#06B6D4]/15 px-1.5 py-0.5 font-display text-[10px] font-medium text-[#06B6D4]">Admin</span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3 pr-3">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
        <div className="shrink-0 border-t border-white/10 bg-[#0A1628] p-3">
          <div className="mb-2 px-3 text-xs text-[rgba(255,255,255,0.4)] truncate">
            {profile?.display_name || 'Admin'}
          </div>
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

      {/* Main content */}
      <main className="flex flex-1 flex-col bg-[#F7F9FA]">
        <header className="flex h-16 items-center border-b border-[#E5E7EB] bg-white px-6 lg:hidden">
          <Database className="h-6 w-6 text-[#06B6D4]" />
          <span className="ml-2 font-display text-base font-bold text-[#0A1628]">data.deepannotate.ai</span>
        </header>
        <div className="flex-1 overflow-auto p-6 bg-[#F7F9FA]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
