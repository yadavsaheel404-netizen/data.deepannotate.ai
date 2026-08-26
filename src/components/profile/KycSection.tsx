import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Upload, Loader2, FileText, ShieldCheck, ShieldAlert, Clock, Eye, Save } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const Req = () => <span className="text-destructive ml-0.5" aria-hidden>*</span>;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const INDIA_ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'passport', label: 'Passport' },
  { value: 'driver_license', label: 'Driver License' },
];

const INTL_ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'driver_license', label: 'Driver License' },
];

const MAX_SIZE_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

function isAtLeast18(date: Date): boolean {
  const today = new Date();
  const eighteen = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  return date <= eighteen;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <Badge variant="outline" className="border-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
        <ShieldCheck className="h-3 w-3" /> Verified
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge variant="outline" className="border-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
        <ShieldAlert className="h-3 w-3" /> Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

export default function KycSection() {
  const { profile, user, fetchProfile } = useAuthStore();
  const userId = profile?.id || user?.uid;
  const p: any = profile || {};
  const isIndia = !p.payout_country || String(p.payout_country).toLowerCase() === 'in' || String(p.payout_country).toLowerCase() === 'india';
  const ID_TYPES = isIndia ? INDIA_ID_TYPES : INTL_ID_TYPES;

  const [gender, setGender] = useState<string>(p.gender || '');
  const [dob, setDob] = useState<Date | undefined>(p.date_of_birth ? new Date(p.date_of_birth) : undefined);
  const [govtIdType, setGovtIdType] = useState<string>(p.govt_id_type || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const status = p.kyc_status || 'pending';
  const hasDocument = !!p.govt_id_url;

  const filledCount =
    (gender ? 1 : 0) + (dob ? 1 : 0) + (govtIdType ? 1 : 0) + (hasDocument ? 1 : 0);
  const totalSteps = 4;
  const kycPct = Math.round((filledCount / totalSteps) * 100);

  const handleFileUpload = async (file: File) => {
    if (!userId) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Only JPG, PNG, or PDF files allowed');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_SIZE_MB}MB`);
      return;
    }
    if (!govtIdType) {
      toast.error('Please select an ID type first');
      return;
    }

    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = `${userId}/govt_id_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('kyc-documents')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { error } = await supabase.from('profiles').update({
        govt_id_url: path,
        govt_id_type: govtIdType,
      } as any).eq('id', userId);
      if (error) throw error;

      await fetchProfile(userId);
      toast.success('Document uploaded — pending admin review');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!userId) return;
    if (!gender) { toast.error('Gender is required'); return; }
    if (!dob) { toast.error('Date of birth is required'); return; }
    if (!isAtLeast18(dob)) { toast.error('You must be at least 18 years old'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        gender,
        date_of_birth: format(dob, 'yyyy-MM-dd'),
        govt_id_type: govtIdType || null,
      } as any).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('KYC details saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleViewDocument = async () => {
    if (!p.govt_id_url) return;
    setViewLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(p.govt_id_url, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err.message || 'Failed to load document');
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-display font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            KYC Verification
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required for payouts & withdrawals
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-muted-foreground">KYC {filledCount}/{totalSteps} steps</span>
          <span className="font-semibold text-primary tabular-nums">{kycPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${kycPct}%` }} />
        </div>
      </div>

      {status === 'rejected' && p.kyc_rejection_reason && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 p-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Rejection reason:</p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{p.kyc_rejection_reason}</p>
        </div>
      )}

      {/* Gender */}
      <div className="space-y-2">
        <Label>Gender<Req /></Label>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* DOB */}
      <div className="space-y-2">
        <Label>Date of Birth<Req /></Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !dob && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dob ? format(dob, 'PPP') : 'Pick your date of birth'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dob}
              onSelect={setDob}
              disabled={(date) => date > new Date() || date < new Date('1925-01-01')}
              defaultMonth={dob ?? new Date(2000, 0)}
              captionLayout="dropdown-buttons"
              fromYear={1925}
              toYear={new Date().getFullYear()}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">You must be at least 18 years old.</p>
      </div>

      {/* ID Type */}
      <div className="space-y-2">
        <Label>Government ID Type<Req /></Label>
        <Select value={govtIdType} onValueChange={setGovtIdType}>
          <SelectTrigger><SelectValue placeholder="Select ID type" /></SelectTrigger>
          <SelectContent>
            {ID_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document upload */}
      <div className="space-y-2">
        <Label>Government ID Document<Req /></Label>
        {hasDocument ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-background p-3">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Document uploaded</p>
              {p.govt_id_uploaded_at && (
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(p.govt_id_uploaded_at), 'MMM d, yyyy')}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleViewDocument}
              disabled={viewLoading}
            >
              {viewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="ml-1.5">View</span>
            </Button>
          </div>
        ) : null}

        <label className={cn(
          'flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 hover:border-primary/50 transition-colors',
          uploading && 'opacity-60 pointer-events-none'
        )}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm text-muted-foreground">
            {uploading ? 'Uploading…' : hasDocument ? 'Replace document' : 'Upload document'}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            className="hidden"
            disabled={uploading || !govtIdType}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          JPG, PNG or PDF · Max {MAX_SIZE_MB}MB · Stored privately, only admins can view
        </p>
      </div>

      <Button
        className="w-full"
        onClick={handleSaveDetails}
        disabled={saving || !gender || !dob}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save KYC Details
      </Button>
    </div>
  );
}
