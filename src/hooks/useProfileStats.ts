import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProfileStats {
  total: number;
  approved: number;
  rejected: number;
  inReview: number;
  earnings: number;
  approvalRate: number; // 0–100
}

const EMPTY: ProfileStats = {
  total: 0,
  approved: 0,
  rejected: 0,
  inReview: 0,
  earnings: 0,
  approvalRate: 0,
};

async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  // Single source of truth: `tasks` is the user-submissions table.
  // Earnings are computed from the `earnings` table (status 'approved' OR 'paid'
  // — once a withdrawal is paid out, the row flips to 'paid', so both count
  // as money the user has actually earned). This matches the Wallet page
  // and the contributor's `profiles.total_earned` counter.
  const [{ data: subs, error: subsErr }, { data: earns, error: earnsErr }] = await Promise.all([
    supabase.from('tasks').select('status').eq('user_id', userId),
    supabase.from('earnings').select('amount, status').eq('user_id', userId),
  ]);
  if (subsErr) throw subsErr;
  if (earnsErr) throw earnsErr;

  const total = subs?.length ?? 0;
  let approved = 0;
  let rejected = 0;
  let inReview = 0;
  for (const s of subs ?? []) {
    if (s.status === 'approved') approved++;
    else if (s.status === 'rejected') rejected++;
    else if (s.status === 'in_review') inReview++;
  }

  const earnings = (earns ?? [])
    .filter((e) => e.status === 'approved' || e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Approval % = approved / total submissions (per spec).
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  return { total, approved, rejected, inReview, earnings, approvalRate };
}

export function useProfileStats(userId?: string | null) {
  const query = useQuery({
    queryKey: ['profile-stats', userId],
    queryFn: () => fetchProfileStats(userId!),
    enabled: !!userId,
    // Use placeholderData (NOT initialData) so the query still fetches on mount.
    // initialData would mark the cache as fresh and skip the network request,
    // leaving the UI showing zeros forever.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });

  return {
    ...query,
    data: query.data ?? EMPTY,
  };
}
