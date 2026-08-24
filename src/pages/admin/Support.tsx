import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved';

interface Ticket {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  category: string;
  message: string;
  screenshot_url: string | null;
  status: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

const statusColor = (s: string) => {
  if (s === 'open') return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
  if (s === 'in_progress') return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
  if (s === 'resolved') return 'bg-success/15 text-success border-success/30';
  return 'bg-muted text-muted-foreground';
};

export default function AdminSupport() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [viewing, setViewing] = useState<Ticket | null>(null);
  const [signedScreenshot, setSignedScreenshot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = viewing?.screenshot_url ?? null;
    if (!url) {
      setSignedScreenshot(null);
      return;
    }
    if (/^https?:\/\//i.test(url)) {
      setSignedScreenshot(url);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from('support-screenshots')
        .createSignedUrl(url, 60 * 10);
      if (cancelled) return;
      setSignedScreenshot(error ? null : data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewing?.screenshot_url]);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support_tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Ticket[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('support_tickets' as any)
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
      toast.success('Status updated');
    },
    onError: (e: any) => toast.error(e.message || 'Update failed'),
  });

  const filtered = (tickets || []).filter((t) => filter === 'all' || t.status === filter);

  const counts = {
    all: tickets?.length || 0,
    open: tickets?.filter((t) => t.status === 'open').length || 0,
    in_progress: tickets?.filter((t) => t.status === 'in_progress').length || 0,
    resolved: tickets?.filter((t) => t.status === 'resolved').length || 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Support Tickets</h1>
        <p className="text-sm text-muted-foreground">Manage user support requests</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['open', 'Open'],
          ['in_progress', 'In Progress'],
          ['resolved', 'Resolved'],
        ] as [StatusFilter, string][]).map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label} ({counts[key]})
          </Button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No tickets found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.user_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{t.user_email}</TableCell>
                  <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">
                        {t.message.length > 60 ? t.message.slice(0, 60) + '...' : t.message}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setViewing(t)}>View</Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.status}
                      onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v })}
                    >
                      <SelectTrigger className={`h-8 w-32 text-xs ${statusColor(t.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ticket Details</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">User</div>
                  <div className="font-medium">{viewing.user_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium truncate">{viewing.user_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Category</div>
                  <Badge variant="outline">{viewing.category}</Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Date</div>
                  <div>{format(new Date(viewing.created_at), 'MMM d, yyyy HH:mm')}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Message</div>
                <div className="rounded-md bg-muted p-3 whitespace-pre-wrap">{viewing.message}</div>
              </div>
              {viewing.screenshot_url && signedScreenshot && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Screenshot</div>
                  <a href={signedScreenshot} target="_blank" rel="noreferrer">
                    <img
                      src={signedScreenshot}
                      alt="Screenshot"
                      className="rounded-md border border-border max-h-64 object-contain"
                    />
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
