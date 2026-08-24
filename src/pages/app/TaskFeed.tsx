import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { fetchActiveTasks } from '@/services/projectService';
import type { Task, MediaType } from '@/types/project';
import TaskCard from '@/components/app/TaskCard';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Inbox, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type MediaFilter = 'all' | MediaType;

const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Text' },
];

export default function TaskFeed() {
  const profile = useAuthStore((s) => s.profile);
  const role = useAuthStore((s) => s.role);
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [bannerDismissed, setBannerDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('profileBannerDismissed') === '1',
  );

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchActiveTasks();
      setTasks(data);
    } catch (err: any) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [profile?.language]);

  // Re-fetch when window regains focus so admin edits (e.g. updated Visible Till)
  // are reflected without a manual page refresh.
  useEffect(() => {
    const onFocus = () => loadTasks();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (t.visible_till && new Date(t.visible_till) < now) return false;
      if (t.filled_tasks >= t.total_tasks) return false;
      if (mediaFilter !== 'all' && t.media_type !== mediaFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, mediaFilter]);

  // Tasks are fully optional and never blocked by profile completion.
  // Contributors can browse and start any task at any time.
  const handleSelect = (task: Task) => {
    navigate(`/app/task/${task.id}`);
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem('profileBannerDismissed', '1');
  };

  const showProfileBanner =
    role !== 'admin' && profile && !profile.profile_completed && !bannerDismissed;

  return (
    <div className="space-y-4 animate-slide-up bg-[#F7F9FA]">
      {showProfileBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-[#06B6D4]/30 bg-[rgba(6,182,212,0.08)] p-3">
          <Sparkles className="h-5 w-5 text-[#06B6D4] shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-bold text-[#0A1628]">Complete your profile to earn bonus tokens</p>
            <p className="text-[#6B7280] text-xs mt-0.5">
              It's optional — you can pick up tasks anytime. Finish your profile to unlock a one-time tokens reward.
            </p>
            <Link
              to="/complete-profile"
              className="mt-1 inline-block text-xs font-semibold text-[#06B6D4] hover:underline"
            >
              Complete profile →
            </Link>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="text-[#9CA3AF] hover:text-[#0A1628]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0A1628]">My Projects</h1>
          <p className="text-sm text-[#6B7280]">
            {loading ? 'Loading tasks…' : `${visibleTasks.length.toLocaleString()} projects available`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadTasks}
          disabled={loading}
          className="shrink-0 text-[#0A1628] hover:bg-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#06B6D4]' : 'text-[#06B6D4]'}`} />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white border-[#E5E7EB] text-[#0A1628] placeholder:text-[#9CA3AF]"
        />
      </div>

      {/* Media filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setMediaFilter(f.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold border transition-colors cursor-pointer',
              mediaFilter === f.value
                ? 'bg-[#06B6D4] text-white border-[#06B6D4]'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-slate-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No projects found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadTasks}>
            Refresh
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
