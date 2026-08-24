import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

const PIE_COLORS = [
  'hsl(154, 64%, 40%)',
  'hsl(0, 72%, 51%)',
  'hsl(38, 92%, 55%)',
  'hsl(220, 60%, 55%)',
  'hsl(280, 50%, 55%)',
  'hsl(180, 50%, 45%)',
];

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', hi: 'Hindi', bn: 'Bengali', te: 'Telugu', mr: 'Marathi',
  ta: 'Tamil', ur: 'Urdu', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
  pa: 'Punjabi', or: 'Odia', as: 'Assamese', mai: 'Maithili', sat: 'Santali',
  ks: 'Kashmiri', ne: 'Nepali', sd: 'Sindhi', kok: 'Konkani',
};

interface Filters {
  range: DateRange | undefined;
  projectId: string;
  language: string;
  categoryId: string;
}

async function fetchAnalyticsData(filters: Filters) {
  const fromIso = filters.range?.from ? startOfDay(filters.range.from).toISOString() : undefined;
  const toIso = filters.range?.to ? endOfDay(filters.range.to).toISOString() : undefined;

  let projectQuery = supabase.from('projects').select('id, title, languages, pay_per_task, project_type');
  if (filters.language !== 'all') projectQuery = projectQuery.contains('languages', [filters.language]);
  const { data: projects = [] } = await projectQuery;

  const projectIdsForFilter =
    filters.projectId !== 'all'
      ? [filters.projectId]
      : filters.language !== 'all'
      ? (projects ?? []).map((p) => p.id)
      : null;

  let tasksQuery = supabase
    .from('tasks')
    .select('id, status, created_at, updated_at, notes, project_id, user_id, selected_category_id');
  if (fromIso) tasksQuery = tasksQuery.gte('created_at', fromIso);
  if (toIso) tasksQuery = tasksQuery.lte('created_at', toIso);
  if (projectIdsForFilter) tasksQuery = tasksQuery.in('project_id', projectIdsForFilter);
  if (filters.categoryId !== 'all') tasksQuery = tasksQuery.eq('selected_category_id', filters.categoryId);
  const { data: tasks = [] } = await tasksQuery;

  let earningsQuery = supabase.from('earnings').select('amount, project_id, user_id, created_at');
  if (fromIso) earningsQuery = earningsQuery.gte('created_at', fromIso);
  if (toIso) earningsQuery = earningsQuery.lte('created_at', toIso);
  if (projectIdsForFilter) earningsQuery = earningsQuery.in('project_id', projectIdsForFilter);
  const { data: earnings = [] } = await earningsQuery;

  return { projects: projects ?? [], tasks: tasks ?? [], earnings: earnings ?? [] };
}

interface CategoryStatRow {
  category_id: string;
  category_name: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  rejection_rate: number;
  completion_rate: number;
}

async function fetchCategoryBreakdown(
  projectId: string,
  range: DateRange | undefined,
): Promise<CategoryStatRow[]> {
  const { data, error } = await supabase.rpc('admin_category_analytics' as any, {
    _project_id: projectId,
    _from: range?.from ? startOfDay(range.from).toISOString() : null,
    _to: range?.to ? endOfDay(range.to).toISOString() : null,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    total: Number(r.total),
    approved: Number(r.approved),
    rejected: Number(r.rejected),
    pending: Number(r.pending),
    rejection_rate: Number(r.rejection_rate),
    completion_rate: Number(r.completion_rate),
  }));
}

export default function AdminAnalytics() {
  const [filters, setFilters] = useState<Filters>({
    range: { from: subDays(new Date(), 29), to: new Date() },
    projectId: 'all',
    language: 'all',
    categoryId: 'all',
  });

  const { data: projectListData } = useQuery({
    queryKey: ['analytics-project-list'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, title, languages, project_type').order('title');
      return data ?? [];
    },
  });

  // Selected project (when one is chosen) — drives category breakdown UI
  const selectedProject = useMemo(
    () => (projectListData ?? []).find((p: any) => p.id === filters.projectId),
    [projectListData, filters.projectId],
  );
  const isCategoryProject = !!selectedProject && (selectedProject as any).project_type === 'category';

  const { data: projectCategories = [] } = useQuery({
    queryKey: ['analytics-project-categories', filters.projectId],
    enabled: isCategoryProject,
    queryFn: async () => {
      const { data } = await supabase
        .from('project_categories')
        .select('id, category_name')
        .eq('project_id', filters.projectId)
        .order('sort_order');
      return (data ?? []) as { id: string; category_name: string }[];
    },
  });

  const { data: categoryBreakdown = [], isFetching: catLoading } = useQuery({
    queryKey: ['analytics-category-breakdown', filters.projectId, filters.range],
    enabled: isCategoryProject,
    queryFn: () => fetchCategoryBreakdown(filters.projectId, filters.range),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', filters],
    queryFn: () => fetchAnalyticsData(filters),
  });

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    (projectListData ?? []).forEach((p: any) => (p.languages ?? []).forEach((l: string) => set.add(l)));
    return Array.from(set).sort();
  }, [projectListData]);

  const charts = useMemo(() => {
    if (!data) return null;
    const { projects, tasks, earnings } = data;

    // Approval rate trend per day
    const dayBuckets = new Map<string, { approved: number; total: number }>();
    tasks.forEach((t: any) => {
      if (t.status === 'in_review') return;
      const day = t.created_at.slice(0, 10);
      const b = dayBuckets.get(day) ?? { approved: 0, total: 0 };
      b.total += 1;
      if (t.status === 'approved') b.approved += 1;
      dayBuckets.set(day, b);
    });
    const approvalTrend = Array.from(dayBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        date: format(new Date(date), 'MMM d'),
        rate: b.total > 0 ? Math.round((b.approved / b.total) * 100) : 0,
      }));

    // Task status distribution
    const statusDist = [
      { name: 'Approved', value: tasks.filter((t: any) => t.status === 'approved').length },
      { name: 'Rejected', value: tasks.filter((t: any) => t.status === 'rejected').length },
      { name: 'In Review', value: tasks.filter((t: any) => t.status === 'in_review').length },
    ];

    // Earnings vs Tasks per project
    const projectMap = new Map(projects.map((p: any) => [p.id, p.title]));
    const perProject = new Map<string, { earnings: number; tasks: number; title: string }>();
    tasks.forEach((t: any) => {
      const title = (projectMap.get(t.project_id) as string) ?? 'Unknown';
      const e = perProject.get(t.project_id) ?? { earnings: 0, tasks: 0, title };
      e.tasks += 1;
      perProject.set(t.project_id, e);
    });
    earnings.forEach((er: any) => {
      const title = (projectMap.get(er.project_id) as string) ?? 'Unknown';
      const e = perProject.get(er.project_id) ?? { earnings: 0, tasks: 0, title };
      e.earnings += Number(er.amount ?? 0);
      perProject.set(er.project_id, e);
    });
    const earningsVsTasks = Array.from(perProject.values())
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 8)
      .map((p) => ({
        project: p.title.length > 16 ? p.title.slice(0, 16) + '…' : p.title,
        earnings: Math.round(p.earnings),
        tasks: p.tasks,
      }));

    // Contributor performance distribution
    const userBuckets = new Map<string, { approved: number; total: number }>();
    tasks.forEach((t: any) => {
      if (t.status === 'in_review') return;
      const b = userBuckets.get(t.user_id) ?? { approved: 0, total: 0 };
      b.total += 1;
      if (t.status === 'approved') b.approved += 1;
      userBuckets.set(t.user_id, b);
    });
    const perfBuckets = [
      { bucket: '0–50%', count: 0 },
      { bucket: '50–80%', count: 0 },
      { bucket: '80–100%', count: 0 },
    ];
    userBuckets.forEach((b) => {
      const rate = (b.approved / b.total) * 100;
      if (rate < 50) perfBuckets[0].count += 1;
      else if (rate < 80) perfBuckets[1].count += 1;
      else perfBuckets[2].count += 1;
    });

    // Rejection reasons (from notes on rejected tasks)
    const reasonMap = new Map<string, number>();
    tasks.forEach((t: any) => {
      if (t.status !== 'rejected') return;
      const raw = (t.notes ?? '').trim();
      const key = raw ? raw.slice(0, 60) : 'No reason provided';
      reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
    });
    const rejectionReasons = Array.from(reasonMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([reason, count]) => ({ reason, count }));

    // Language-wise contribution
    const langMap = new Map<string, number>();
    tasks.forEach((t: any) => {
      const proj = projects.find((p: any) => p.id === t.project_id);
      (proj?.languages ?? []).forEach((l: string) => {
        langMap.set(l, (langMap.get(l) ?? 0) + 1);
      });
    });
    const languageData = Array.from(langMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([lang, count]) => ({ language: LANGUAGE_LABELS[lang] ?? lang, count }));

    // Avg review time (created_at -> updated_at on approved/rejected)
    const reviewTimes: number[] = [];
    tasks.forEach((t: any) => {
      if (t.status !== 'approved' && t.status !== 'rejected') return;
      const created = new Date(t.created_at).getTime();
      const updated = new Date(t.updated_at).getTime();
      if (updated > created) reviewTimes.push((updated - created) / 1000 / 60 / 60);
    });
    const avgReviewHours =
      reviewTimes.length > 0 ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : 0;

    return {
      approvalTrend,
      statusDist,
      earningsVsTasks,
      perfBuckets,
      rejectionReasons,
      languageData,
      avgReviewHours,
      totalReviewed: reviewTimes.length,
    };
  }, [data]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="font-display text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Insights to improve platform performance and decision-making
        </p>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start gap-2 text-left font-normal',
                  !filters.range && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {filters.range?.from ? (
                  filters.range.to ? (
                    <>
                      {format(filters.range.from, 'LLL d, y')} –{' '}
                      {format(filters.range.to, 'LLL d, y')}
                    </>
                  ) : (
                    format(filters.range.from, 'LLL d, y')
                  )
                ) : (
                  <span>Pick date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={filters.range}
                onSelect={(range) => setFilters((f) => ({ ...f, range }))}
                numberOfMonths={2}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>

          <Select
            value={filters.projectId}
            onValueChange={(v) => setFilters((f) => ({ ...f, projectId: v, categoryId: 'all' }))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(projectListData ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.language}
            onValueChange={(v) => setFilters((f) => ({ ...f, language: v }))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {availableLanguages.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_LABELS[l] ?? l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters({
                range: { from: subDays(new Date(), 29), to: new Date() },
                projectId: 'all',
                language: 'all',
                categoryId: 'all',
              })
            }
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* Category chips — only when a category-type project is selected */}
      {isCategoryProject && projectCategories.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-medium">Filter by activity category</p>
                <p className="text-xs text-muted-foreground">
                  Affects the charts above; the breakdown below always shows all categories.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filters.categoryId === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters((f) => ({ ...f, categoryId: 'all' }))}
              >
                All Categories
              </Button>
              {projectCategories.map((c) => (
                <Button
                  key={c.id}
                  variant={filters.categoryId === c.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters((f) => ({ ...f, categoryId: c.id }))}
                >
                  {c.category_name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category-level breakdown — server aggregated for performance */}
      {isCategoryProject && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {catLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : categoryBreakdown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No categories configured for this project yet.
              </p>
            ) : (
              <>
                <ChartContainer
                  config={{
                    approved: { label: 'Approved', color: 'hsl(154, 64%, 40%)' },
                    rejected: { label: 'Rejected', color: 'hsl(0, 72%, 51%)' },
                    pending: { label: 'Pending', color: 'hsl(38, 92%, 55%)' },
                  }}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={categoryBreakdown.map((r) => ({
                      category: r.category_name.length > 14 ? r.category_name.slice(0, 14) + '…' : r.category_name,
                      approved: r.approved,
                      rejected: r.rejected,
                      pending: r.pending,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="category" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="approved" stackId="s" fill="var(--color-approved)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="rejected" stackId="s" fill="var(--color-rejected)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pending" stackId="s" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                        <th className="py-2 pr-3 font-medium">Category</th>
                        <th className="py-2 px-3 font-medium text-right">Total</th>
                        <th className="py-2 px-3 font-medium text-right">Approved</th>
                        <th className="py-2 px-3 font-medium text-right">Rejected</th>
                        <th className="py-2 px-3 font-medium text-right">Pending</th>
                        <th className="py-2 px-3 font-medium text-right">Rejection %</th>
                        <th className="py-2 pl-3 font-medium text-right">Completion %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryBreakdown.map((r) => (
                        <tr key={r.category_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 pr-3 font-medium">{r.category_name}</td>
                          <td className="py-2 px-3 text-right">{r.total}</td>
                          <td className="py-2 px-3 text-right text-green-600 dark:text-green-400">{r.approved}</td>
                          <td className="py-2 px-3 text-right text-red-600 dark:text-red-400">{r.rejected}</td>
                          <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400">{r.pending}</td>
                          <td className="py-2 px-3 text-right">{r.rejection_rate}%</td>
                          <td className="py-2 pl-3 text-right font-semibold">{r.completion_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading || !charts ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Key insight cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Review Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-bold">
                  {charts.avgReviewHours < 1
                    ? `${Math.round(charts.avgReviewHours * 60)} min`
                    : `${charts.avgReviewHours.toFixed(1)} hrs`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Across {charts.totalReviewed} reviewed submissions
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overall Approval Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-bold">
                  {(() => {
                    const a = charts.statusDist[0].value;
                    const r = charts.statusDist[1].value;
                    const tot = a + r;
                    return tot > 0 ? `${Math.round((a / tot) * 100)}%` : '—';
                  })()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Approved vs rejected (excludes pending)</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Submissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-bold">
                  {charts.statusDist.reduce((s, x) => s + x.value, 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Approval Rate Trend */}
            <Card className="shadow-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Approval Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ rate: { label: '% Approved', color: 'hsl(154, 64%, 40%)' } }}
                  className="h-[280px] w-full"
                >
                  <LineChart data={charts.approvalTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="var(--color-rate)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Task Status Distribution */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Task Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    Approved: { label: 'Approved', color: 'hsl(154, 64%, 40%)' },
                    Rejected: { label: 'Rejected', color: 'hsl(0, 72%, 51%)' },
                    'In Review': { label: 'In Review', color: 'hsl(38, 92%, 55%)' },
                  }}
                  className="h-[280px] w-full"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={charts.statusDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                    >
                      {charts.statusDist.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Contributor Performance */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Contributor Performance Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ count: { label: 'Contributors', color: 'hsl(220, 60%, 55%)' } }}
                  className="h-[280px] w-full"
                >
                  <BarChart data={charts.perfBuckets}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Earnings vs Tasks */}
            <Card className="shadow-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Earnings vs Tasks (Top Projects)</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    earnings: { label: 'Earnings (₹)', color: 'hsl(154, 64%, 40%)' },
                    tasks: { label: 'Tasks', color: 'hsl(220, 60%, 55%)' },
                  }}
                  className="h-[300px] w-full"
                >
                  <BarChart data={charts.earningsVsTasks}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="project" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="earnings" fill="var(--color-earnings)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="tasks" fill="var(--color-tasks)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Rejection Reasons */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Rejection Reasons Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {charts.rejectionReasons.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No rejections in selected range
                  </p>
                ) : (
                  <ChartContainer
                    config={{ count: { label: 'Count', color: 'hsl(0, 72%, 51%)' } }}
                    className="h-[280px] w-full"
                  >
                    <BarChart data={charts.rejectionReasons} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="reason"
                        width={150}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Language-wise Contribution */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Language-wise Contribution</CardTitle>
              </CardHeader>
              <CardContent>
                {charts.languageData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No data</p>
                ) : (
                  <ChartContainer
                    config={{ count: { label: 'Tasks', color: 'hsl(280, 50%, 55%)' } }}
                    className="h-[280px] w-full"
                  >
                    <BarChart data={charts.languageData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="language"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
