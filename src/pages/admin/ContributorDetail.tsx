import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, BarChart3, Wallet, Activity, Mail, Phone, Briefcase, Globe, Languages, Sparkles, Clock, Linkedin, Github } from 'lucide-react';
import { format } from 'date-fns';
import KycReviewCard from '@/components/admin/KycReviewCard';

interface ContributorProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  skills: string[] | null;
  language: string[] | null;
  current_status: string | null;
  hours_per_week: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  avatar_url: string | null;
  created_at: string;
  wallet_balance: number;
  total_earned: number;
  total_paid: number;
  is_active: boolean;
}

interface SubmissionRow {
  id: string;
  status: string;
  created_at: string;
  notes: string | null;
  project: { title: string } | null;
}

async function fetchContributorDetail(userId: string) {
  const [profileRes, submissionsRes, earningsRes, withdrawRes, allSubsWithTasks, ticketRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('tasks').select('id, status, created_at, notes, project:projects(title)').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('tasks').select('id, status').eq('user_id', userId),
    supabase.from('withdraw_requests').select('amount, status').eq('user_id', userId),
    supabase.from('earnings').select('amount, project_id, projects(title)').eq('user_id', userId),
    // Fallback email lookup from latest support ticket if profile.email is missing
    supabase.from('support_tickets').select('user_email').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);

  if (profileRes.error) throw profileRes.error;
  const profile = profileRes.data as any;
  const resolvedEmail: string | null =
    profile?.email || ticketRes.data?.[0]?.user_email || null;

  const allSubs = earningsRes.data ?? [];
  const total = allSubs.length;
  const approved = allSubs.filter((s: any) => s.status === 'approved').length;
  const rejected = allSubs.filter((s: any) => s.status === 'rejected').length;
  const pending = allSubs.filter((s: any) => s.status === 'in_review').length;

  const pendingPayouts = (withdrawRes.data ?? [])
    .filter((w: any) => w.status === 'pending' || w.status === 'approved')
    .reduce((sum: number, w: any) => sum + Number(w.amount), 0);

  // Project-wise breakdown from earnings
  const projectMap: Record<string, { title: string; amount: number; count: number }> = {};
  for (const e of (allSubsWithTasks.data ?? []) as any[]) {
    const title = e.projects?.title ?? 'Unknown';
    if (!projectMap[title]) projectMap[title] = { title, amount: 0, count: 0 };
    projectMap[title].amount += Number(e.amount);
    projectMap[title].count += 1;
  }

  return {
    profile: profile as ContributorProfile,
    email: resolvedEmail,
    recentSubmissions: (submissionsRes.data ?? []) as unknown as SubmissionRow[],
    stats: {
      totalSubmissions: total,
      approved, rejected, pending,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      pendingPayouts,
    },
    projectBreakdown: Object.values(projectMap),
  };
}

export default function ContributorDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contributor-detail', userId],
    queryFn: () => fetchContributorDetail(userId!),
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Contributor not found.</p>;

  const { profile, email, recentSubmissions, stats, projectBreakdown } = data;
  const initials = (profile.display_name || '?').slice(0, 2).toUpperCase();

  const personalDetails: { icon: any; label: string; value: React.ReactNode }[] = [
    { icon: Mail, label: 'Email', value: email || <span className="text-muted-foreground">No email available</span> },
    { icon: Phone, label: 'Phone', value: profile.phone || <span className="text-muted-foreground">—</span> },
    { icon: Briefcase, label: 'Current Status', value: profile.current_status || <span className="text-muted-foreground">—</span> },
    { icon: Globe, label: 'Country', value: profile.country || <span className="text-muted-foreground">—</span> },
    { icon: Clock, label: 'Hours / Week', value: profile.hours_per_week || <span className="text-muted-foreground">—</span> },
    {
      icon: Linkedin,
      label: 'LinkedIn',
      value: profile.linkedin_url
        ? <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate inline-block max-w-full">{profile.linkedin_url}</a>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      icon: Github,
      label: 'GitHub',
      value: profile.github_url
        ? <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate inline-block max-w-full">{profile.github_url}</a>
        : <span className="text-muted-foreground">—</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/contributors')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Contributors
      </Button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 ring-2 ring-primary/20">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.display_name || 'avatar'} />}
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-display">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-display text-2xl font-bold">{profile.display_name || 'Unnamed'}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {profile.country && <span>{profile.country}</span>}
            <span>·</span>
            <span>Joined {format(new Date(profile.created_at), 'MMM d, yyyy')}</span>
            <Badge variant={profile.is_active ? 'default' : 'destructive'} className="ml-2">
              {profile.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-display">Personal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Avatar + name highlight on mobile already in header — keep this section as data grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {personalDetails.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="text-sm font-medium truncate">{value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Languages */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Languages className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-1.5">Preferred Languages</p>
              {profile.language && profile.language.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.language.map((l) => (
                    <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>

          {/* Skills */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-1.5">Skills</p>
              {profile.skills && profile.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Verification */}
      <KycReviewCard userId={userId!} profile={profile} onUpdated={() => refetch()} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Tasks', value: stats.totalSubmissions, icon: Activity },
          { label: 'Approved', value: stats.approved, icon: BarChart3 },
          { label: 'Rejected', value: stats.rejected, icon: BarChart3 },
          { label: 'In Review', value: stats.pending, icon: BarChart3 },
          { label: 'Approval Rate', value: `${stats.approvalRate}%`, icon: BarChart3 },
          { label: 'Wallet Balance', value: `₹${Number(profile.wallet_balance).toFixed(0)}`, icon: Wallet },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold font-display mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Info */}
      <Card>
        <CardHeader><CardTitle className="text-base font-display">Payment Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Total Earned</p><p className="font-bold">₹{Number(profile.total_earned).toFixed(0)}</p></div>
            <div><p className="text-muted-foreground">Total Paid</p><p className="font-bold">₹{Number(profile.total_paid).toFixed(0)}</p></div>
            <div><p className="text-muted-foreground">Pending Payouts</p><p className="font-bold">₹{stats.pendingPayouts.toFixed(0)}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Project-wise Breakdown */}
      {projectBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-display">Project-wise Earnings</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectBreakdown.map((p: any) => (
                  <TableRow key={p.title}>
                    <TableCell className="font-medium text-sm">{p.title}</TableCell>
                    <TableCell className="text-center text-sm">{p.count}</TableCell>
                    <TableCell className="text-right text-sm font-bold">₹{p.amount.toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Tasks */}
      <Card>
        <CardHeader><CardTitle className="text-base font-display">Recent Tasks</CardTitle></CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSubmissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{(s.project as any)?.title || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'approved' ? 'default' : s.status === 'rejected' ? 'destructive' : 'secondary'} className="capitalize">
                        {s.status === 'in_review' ? 'In Review' : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(s.created_at), 'MMM d, yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
