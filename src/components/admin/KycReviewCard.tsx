import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ShieldCheck, ShieldAlert, Clock, Eye, Loader2, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  userId: string;
  profile: any;
  onUpdated?: () => void;
}

const ID_LABEL: Record<string, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  passport: 'Passport',
  driver_license: 'Driver License',
  national_id: 'National ID',
};

const GENDER_LABEL: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'verified') return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>;
  if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> Rejected</Badge>;
  return <Badge variant="outline" className="gap-1 bg-yellow-100 text-yellow-700 border-0 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3" /> Pending</Badge>;
}

export default function KycReviewCard({ userId, profile, onUpdated }: Props) {
  const adminUser = useAuthStore((s) => s.user);
  const [viewLoading, setViewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const status: string = profile?.kyc_status || 'pending';
  const hasDoc = !!profile?.govt_id_url;

  const handleView = async () => {
    if (!profile?.govt_id_url) return;
    setViewLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(profile.govt_id_url, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err.message || 'Failed to load document');
    } finally {
      setViewLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        kyc_status: 'verified',
        govt_id_verified: true,
        kyc_rejection_reason: null,
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reviewed_by: adminUser?.id ?? null,
      } as any).eq('id', userId);
      if (error) throw error;
      toast.success('KYC approved');
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        kyc_status: 'rejected',
        govt_id_verified: false,
        kyc_rejection_reason: rejectReason.trim(),
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reviewed_by: adminUser?.id ?? null,
      } as any).eq('id', userId);
      if (error) throw error;
      toast.success('KYC rejected');
      setRejectOpen(false);
      setRejectReason('');
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> KYC Verification
        </CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Gender</p>
            <p className="font-medium">{profile?.gender ? GENDER_LABEL[profile.gender] || profile.gender : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date of Birth</p>
            <p className="font-medium">
              {profile?.date_of_birth ? format(new Date(profile.date_of_birth), 'MMM d, yyyy') : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ID Type</p>
            <p className="font-medium">{profile?.govt_id_type ? (ID_LABEL[profile.govt_id_type] || profile.govt_id_type) : '—'}</p>
          </div>
        </div>

        {hasDoc ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Government ID document</p>
              {profile?.govt_id_uploaded_at && (
                <p className="text-[11px] text-muted-foreground">
                  Uploaded {format(new Date(profile.govt_id_uploaded_at), 'MMM d, yyyy HH:mm')}
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={handleView} disabled={viewLoading}>
              {viewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="ml-1.5">View Document</span>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No document uploaded yet.</p>
        )}

        {status === 'rejected' && profile?.kyc_rejection_reason && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 p-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-400">Last rejection reason:</p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{profile.kyc_rejection_reason}</p>
          </div>
        )}

        {hasDoc && status !== 'verified' && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Approve KYC
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={actionLoading}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Reject KYC
            </Button>
          </div>
        )}

        {status === 'verified' && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectOpen(true)}
              disabled={actionLoading}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Revoke / Reject
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC</DialogTitle>
            <DialogDescription>
              The contributor will be notified of the rejection reason and asked to re-upload.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Document is unclear, please re-upload a sharper photo"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}>
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
