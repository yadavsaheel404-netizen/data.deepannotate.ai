import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Save, Loader2, Upload, X, CheckCircle2, XCircle, Clock,
  ListChecks, IndianRupee, TrendingUp, Camera, Copy, Check,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import SupportWidget from '@/components/app/SupportWidget';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { isValidUpi, sanitizeUpiInput } from '@/lib/upiValidation';
import { getFirstName } from '@/lib/displayName';
import { formatMoney } from '@/lib/formatMoney';
import { useProfileStats } from '@/hooks/useProfileStats';
import PhoneInput from '@/components/profile/PhoneInput';
import MultiSelectCombobox from '@/components/profile/MultiSelectCombobox';
import KycSection from '@/components/profile/KycSection';
import TwoFactorSection from '@/components/profile/TwoFactorSection';

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' },
  { value: 'fil', label: 'Filipino' },
  { value: 'bn', label: 'Bengali' }, { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' }, { value: 'ta', label: 'Tamil' },
  { value: 'ur', label: 'Urdu' }, { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' }, { value: 'or', label: 'Odia' },
  { value: 'ml', label: 'Malayalam' }, { value: 'pa', label: 'Punjabi' },
  { value: 'as', label: 'Assamese' }, { value: 'mai', label: 'Maithili' },
  { value: 'sa', label: 'Sanskrit' }, { value: 'mni', label: 'Manipuri' },
  { value: 'sd', label: 'Sindhi' }, { value: 'doi', label: 'Dogri' },
  { value: 'ks', label: 'Kashmiri' },
];

// Priority skills shown at the top
const PRIORITY_SKILLS = [
  'AI Data Labeling',
  'Language Translator (English to 22 languages)',
  'Data Pre-processor',
  'Video Editor',
  'Prompt Analyzer',
  'Finance & Accounting Specialist',
  'VFX Artist',
  'UI/UX Designer',
  'Technical Content Writer',
  'Prompt Engineer',
  'K–12 Teacher',
  'Software Programmer (Beginner)',
  'Software Programmer (Advanced)',
  'Legal Consultant (Lawyer)',
  'Language Teacher',
  'STEM Teacher',
  'Music Enthusiast',
  'Audio Mixing Engineer',
  'Design Engineer',
];

const LEGACY_SKILLS = [
  'Text Annotation', 'Audio Transcription', 'Video Labeling', 'Image Tagging',
  'Translation', 'Transliteration', 'Data Collection', 'Quality Review',
  'Sentiment Analysis', 'Named Entity Recognition', 'OCR Correction',
  'Speech Recording', 'Content Moderation', 'Summarization', 'Question Answering',
];

const HOURS_OPTIONS = [
  { value: 'lt5', label: 'Less than 5 hours' },
  { value: '5-10', label: '5–10 hours' },
  { value: '10-20', label: '10–20 hours' },
  { value: '20+', label: '20+ hours' },
];

const STATUS_OPTIONS = [
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
  { value: 'ug', label: 'UG (Undergraduate)' },
  { value: 'working_professional', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'freelancer', label: 'Freelancer' },
];

// Statuses that prompt a working profession
const PROFESSION_STATUSES = new Set(['working_professional', 'self_employed', 'freelancer']);

const PROFESSION_OPTIONS = [
  'Doctor', 'Lawyer', 'Software Engineer', 'Teacher', 'Designer',
  'Student', 'Business Owner', 'Accountant', 'Other',
];

// Required-field asterisk
const Req = () => <span className="text-destructive ml-0.5" aria-hidden>*</span>;

function computeProfileCompletion(profile: any): { filled: number; total: number } {
  const total = 9;
  let filled = 0;
  if (profile?.display_name) filled++;
  if (profile?.phone) filled++;
  if (profile?.avatar_url) filled++;
  if (profile?.resume_url) filled++;
  if (profile?.linkedin_url) filled++;
  if (profile?.hours_per_week) filled++;
  if (profile?.language && (profile.language as string[]).length > 0) filled++;
  if (profile?.skills && (profile.skills as string[]).length > 0) filled++;
  if (profile?.upi_id) filled++;
  return { filled, total };
}

export default function Profile() {
  const { profile, user, fetchProfile } = useAuthStore();
  const userId = profile?.id || user?.uid;
  const { data: stats, isFetching: statsLoading } = useProfileStats(userId);

  useEffect(() => {
    if (userId) fetchProfile(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url || '');
  const [githubUrl, setGithubUrl] = useState(profile?.github_url || '');
  const [hoursPerWeek, setHoursPerWeek] = useState(profile?.hours_per_week || '');
  const [currentStatus, setCurrentStatus] = useState((profile as any)?.current_status || '');
  const [workingProfession, setWorkingProfession] = useState<string>((profile as any)?.working_profession || '');
  const [languages, setLanguages] = useState<string[]>((profile?.language as unknown as string[]) || ['en']);
  const [skills, setSkills] = useState<string[]>((profile?.skills as unknown as string[]) || []);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  const [savingPayment, setSavingPayment] = useState(false);
  const [payoutCountry, setPayoutCountry] = useState<string>((profile as any)?.payout_country || 'IN');
  const [paypalEmail, setPaypalEmail] = useState<string>((profile as any)?.paypal_email || '');
  const [upiId, setUpiId] = useState(profile?.upi_id || '');
  const [accountHolderName, setAccountHolderName] = useState(profile?.account_holder_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(profile?.bank_account_number || '');
  const [ifscCode, setIfscCode] = useState(profile?.ifsc_code || '');

  const initials = (displayName || user?.email || '?').slice(0, 2).toUpperCase();
  const completion = computeProfileCompletion(profile);
  const completionPct = Math.round((completion.filled / completion.total) * 100);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setPhone(profile.phone || '');
      setLinkedinUrl(profile.linkedin_url || '');
      setGithubUrl(profile.github_url || '');
      setHoursPerWeek(profile.hours_per_week || '');
      setCurrentStatus((profile as any).current_status || '');
      setWorkingProfession((profile as any).working_profession || '');
      setLanguages((profile.language as unknown as string[]) || ['en']);
      setSkills((profile.skills as unknown as string[]) || []);
      setUpiId(profile.upi_id || '');
      setAccountHolderName(profile.account_holder_name || '');
      setBankAccountNumber(profile.bank_account_number || '');
      setIfscCode(profile.ifsc_code || '');
      setPayoutCountry((profile as any).payout_country || 'IN');
      setPaypalEmail((profile as any).paypal_email || '');
    }
  }, [profile]);

  const handleAvatarUpload = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setAvatarUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatar_url = `${urlData.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('Profile photo updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!userId) return;
    setAvatarUploading(true);
    try {
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('Profile photo removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const toggleLanguage = (val: string) =>
    setLanguages((prev) => prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val]);
  const toggleSkill = (val: string) =>
    setSkills((prev) => prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]);

  const handleSavePersonal = async () => {
    if (!userId) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setDisplayNameError('Display Name is required');
      toast.error('Display Name is required');
      return;
    }
    setDisplayNameError(null);
    if (!phone || phone.replace(/\D/g, '').length < 6) {
      toast.error('Phone number is required');
      return;
    }
    if (!currentStatus) { toast.error('Current status is required'); return; }
    const needsProfession = PROFESSION_STATUSES.has(currentStatus);
    if (needsProfession && !workingProfession.trim()) {
      toast.error('Working profession is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        display_name: trimmedName,
        phone,
        current_status: currentStatus || null,
        working_profession: needsProfession ? workingProfession.trim() : null,
      } as any).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('Personal info updated');
    } catch (err: any) {
      const msg = err.message || 'Failed to update profile';
      if (/display_name/i.test(msg)) setDisplayNameError('Display Name is required');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSkills = async () => {
    if (!userId) return;
    if (languages.length === 0) { toast.error('Select at least one language'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        language: languages,
        skills,
        hours_per_week: hoursPerWeek || null,
        linkedin_url: linkedinUrl.trim() || null,
        github_url: githubUrl.trim() || null,
      }).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('Skills & preferences updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayment = async () => {
    if (!userId) return;
    setSavingPayment(true);
    try {
      let updates: Record<string, any> = { payout_country: payoutCountry };

      if (payoutCountry === 'IN') {
        if (!upiId || !isValidUpi(upiId)) {
          toast.error('Enter a valid UPI ID (e.g. name@bank)');
          setSavingPayment(false);
          return;
        }
        const trimmedHolder = accountHolderName.trim();
        if (!trimmedHolder || trimmedHolder.length < 2) {
          toast.error('Account Holder Name is required');
          setSavingPayment(false);
          return;
        }
        updates = {
          ...updates,
          upi_id: upiId || null,
          account_holder_name: trimmedHolder,
          bank_account_number: bankAccountNumber || null,
          ifsc_code: ifscCode || null,
          paypal_email: null,
        };
      } else {
        const email = paypalEmail.trim();
        const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailValid) {
          toast.error('Enter a valid PayPal email');
          setSavingPayment(false);
          return;
        }
        updates = { ...updates, paypal_email: email };
      }

      const { error } = await supabase.from('profiles').update(updates as any).eq('id', userId);
      if (error) throw error;
      await fetchProfile(userId);
      toast.success('Payment details updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update payment details');
    } finally {
      setSavingPayment(false);
    }
  };

  const joinedLabel = profile?.created_at
    ? format(new Date(profile.created_at), 'MMM yyyy')
    : '—';

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-slide-up">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4 pt-2 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className="relative h-14 w-14 shrink-0 rounded-full"
          >
            <Avatar className="h-14 w-14" key={profile?.avatar_url || 'no-avatar'}>
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-display">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Camera className="h-3 w-3" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-bold leading-tight truncate">
              {getFirstName(displayName || user?.email)}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            {(profile as any)?.public_user_id && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  User ID: <span className="font-mono font-medium text-foreground">{(profile as any).public_user_id}</span>
                </span>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText((profile as any).public_user_id);
                            toast.success('User ID copied');
                          } catch {
                            toast.error('Failed to copy');
                          }
                        }}
                        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy User ID"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Share this ID to receive tips</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Joined {joinedLabel}</p>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              Profile {completion.filled}/{completion.total} complete
            </span>
            <span className="text-[11px] font-semibold text-primary tabular-nums">{completionPct}%</span>
          </div>
          <Progress value={completionPct} className="h-1.5 [&>div]:bg-primary" />
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="text-xs py-2">Overview</TabsTrigger>
          <TabsTrigger value="personal" className="text-xs py-2">Personal</TabsTrigger>
          <TabsTrigger value="skills" className="text-xs py-2">Skills</TabsTrigger>
          <TabsTrigger value="payment" className="text-xs py-2">Payments</TabsTrigger>
          <TabsTrigger value="security" className="text-xs py-2">Security</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-display text-sm font-bold text-[#0A1628]">Quick Stats</h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatCard label="Total Tasks" value={stats.total} icon={ListChecks} tone="text-[#0A1628]" loading={statsLoading} />
                <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} tone="text-[#06B6D4]" loading={statsLoading} />
                <StatCard label="Rejected" value={stats.rejected} icon={XCircle} tone="text-rose-600" loading={statsLoading} />
                <StatCard label="In Review" value={stats.inReview} icon={Clock} tone="text-amber-600" loading={statsLoading} />
                {/* Single Hero Metric: Earnings */}
                <StatCard label="Earnings" value={`₹${formatMoney(stats.earnings)}`} icon={IndianRupee} tone="text-[#06B6D4]" isHero loading={statsLoading} />
                <StatCard label="Approval %" value={`${stats.approvalRate}%`} icon={TrendingUp} tone="text-[#0A1628]" loading={statsLoading} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERSONAL INFO */}
        <TabsContent value="personal">
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-5">
              {/* Avatar upload */}
              <div className="space-y-2">
                <Label>Profile Photo</Label>
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14" key={profile?.avatar_url || 'no-avatar-edit'}>
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-display">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 hover:border-primary/50 transition-colors">
                    {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      : <Upload className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">
                      {avatarUploading ? 'Uploading…' : profile?.avatar_url ? 'Change photo' : 'Upload a photo'}
                    </span>
                    <input
                      type="file" accept="image/*" className="hidden" disabled={avatarUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAvatarUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {profile?.avatar_url && !avatarUploading && (
                    <Button type="button" variant="ghost" size="icon" onClick={handleAvatarRemove} title="Remove photo">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Max 5MB</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name<Req /></Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (displayNameError && e.target.value.trim()) setDisplayNameError(null);
                  }}
                  placeholder="Your full name"
                  aria-invalid={!!displayNameError}
                  className={displayNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {displayNameError ? (
                  <p className="text-xs text-destructive">{displayNameError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Your full name as shown on records.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone<Req /></Label>
                <PhoneInput id="phone" value={phone} onChange={setPhone} />
                <p className="text-xs text-muted-foreground">Choose your country code, then enter your number.</p>
              </div>

              <div className="space-y-2">
                <Label>Current Status<Req /></Label>
                <Select value={currentStatus} onValueChange={(v) => {
                  setCurrentStatus(v);
                  if (!PROFESSION_STATUSES.has(v)) setWorkingProfession('');
                }}>
                  <SelectTrigger><SelectValue placeholder="Select your current status" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {PROFESSION_STATUSES.has(currentStatus) && (
                <div className="space-y-2">
                  <Label>Working Profession<Req /></Label>
                  {workingProfession === '__other__' || (workingProfession && !PROFESSION_OPTIONS.includes(workingProfession)) ? (
                    <div className="space-y-2">
                      <Input
                        value={workingProfession === '__other__' ? '' : workingProfession}
                        onChange={(e) => setWorkingProfession(e.target.value)}
                        placeholder="Enter your profession"
                      />
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => setWorkingProfession('')}
                      >
                        Choose from list instead
                      </button>
                    </div>
                  ) : (
                    <Select
                      value={workingProfession}
                      onValueChange={(v) => setWorkingProfession(v === 'Other' ? '__other__' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select your profession" /></SelectTrigger>
                      <SelectContent>
                        {PROFESSION_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <Button className="w-full" onClick={handleSavePersonal} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Personal Info
              </Button>

              {/* KYC Verification */}
              <KycSection />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SKILLS & PREFERENCES */}
        <TabsContent value="skills">
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-5">
              <div className="space-y-2">
                <Label>Preferred Languages<Req /></Label>
                <p className="text-xs text-muted-foreground">Select all languages you can work with. Choose "Other" to add a custom language.</p>
                <MultiSelectCombobox
                  options={LANGUAGES}
                  value={languages}
                  onChange={setLanguages}
                  placeholder="Select languages…"
                  searchPlaceholder="Search languages…"
                  emptyText="No languages found"
                  allowOther
                  otherLabel="Other (add your own)"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Label>Skills</Label>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground cursor-help underline decoration-dotted underline-offset-2 inline-block">
                            Select skills relevant to your experience
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Pick everything you can do — admins use this to match you to suitable tasks.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-xs font-medium text-primary tabular-nums shrink-0 mt-0.5">
                    {skills.length} selected
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Priority Skills</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRIORITY_SKILLS.map((skill) => (
                      <SkillCard
                        key={skill}
                        label={skill}
                        selected={skills.includes(skill)}
                        onToggle={() => toggleSkill(skill)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Other Skills</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LEGACY_SKILLS.map((skill) => (
                      <SkillCard
                        key={skill}
                        label={skill}
                        selected={skills.includes(skill)}
                        onToggle={() => toggleSkill(skill)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hours Available Per Week</Label>
                <Select value={hoursPerWeek} onValueChange={setHoursPerWeek}>
                  <SelectTrigger><SelectValue placeholder="Select availability" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin">LinkedIn URL</Label>
                <Input id="linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="github">GitHub URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="github" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/yourname" />
              </div>

              <Button className="w-full" onClick={handleSaveSkills} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Skills & Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payment">
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-4">
              {/* Country selector */}
              <div className="space-y-2">
                <Label htmlFor="payoutCountry">Select your payout country<Req /></Label>
                <Select value={payoutCountry} onValueChange={setPayoutCountry}>
                  <SelectTrigger id="payoutCountry">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">🇮🇳 India</SelectItem>
                    <SelectItem value="OTHER">🌍 Others (PayPal)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  We use this information to process payouts securely.
                </p>
              </div>

              {payoutCountry === 'IN' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="upiId">UPI ID<Req /></Label>
                    <Input
                      id="upiId" value={upiId}
                      onChange={(e) => setUpiId(sanitizeUpiInput(e.target.value))}
                      onPaste={(e) => { e.preventDefault(); setUpiId(sanitizeUpiInput(e.clipboardData.getData('text'))); }}
                      placeholder="e.g. vivek@ybl"
                      inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      aria-invalid={upiId.length > 0 && !isValidUpi(upiId)}
                      className={cn(
                        upiId.length > 0 && !isValidUpi(upiId) && 'border-destructive focus-visible:ring-destructive',
                        upiId.length > 0 && isValidUpi(upiId) && 'border-success focus-visible:ring-success',
                      )}
                    />
                    {upiId.length > 0 && !isValidUpi(upiId) ? (
                      <p className="text-xs text-destructive">Enter a valid UPI ID (e.g. name@bank)</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Format: name@bank</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountHolder">Account Holder Name<Req /></Label>
                    <Input
                      id="accountHolder" value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      placeholder="Full name as on bank account"
                      aria-invalid={accountHolderName.length > 0 && accountHolderName.trim().length < 2}
                      className={cn(
                        accountHolderName.length > 0 && accountHolderName.trim().length < 2 && 'border-destructive focus-visible:ring-destructive',
                        accountHolderName.trim().length >= 2 && 'border-success focus-visible:ring-success',
                      )}
                    />
                    {accountHolderName.length > 0 && accountHolderName.trim().length < 2 && (
                      <p className="text-xs text-destructive">Account Holder Name is required</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankAccount">Bank Account Number *</Label>
                    <Input
                      id="bankAccount"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      placeholder="Account number"
                      aria-invalid={bankAccountNumber.length > 0 && bankAccountNumber.length < 9}
                      className={cn(
                        bankAccountNumber.length > 0 && bankAccountNumber.length < 9 && 'border-destructive focus-visible:ring-destructive',
                        bankAccountNumber.length >= 9 && 'border-success focus-visible:ring-success',
                      )}
                    />
                    {bankAccountNumber.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Required. Enter your bank account number.</p>
                    ) : bankAccountNumber.length < 9 ? (
                      <p className="text-xs text-destructive">Enter a valid account number (min 9 digits)</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifsc">IFSC Code *</Label>
                    <Input
                      id="ifsc"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="e.g. HDFC0001234"
                      maxLength={11}
                      aria-invalid={ifscCode.length > 0 && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)}
                      className={cn(
                        ifscCode.length > 0 && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) && 'border-destructive focus-visible:ring-destructive',
                        /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) && 'border-success focus-visible:ring-success',
                      )}
                    />
                    {ifscCode.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Required. Enter your bank IFSC code.</p>
                    ) : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) ? (
                      <p className="text-xs text-destructive">Invalid IFSC code (e.g. HDFC0001234)</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="paypalEmail">PayPal Email<Req /></Label>
                  <Input
                    id="paypalEmail"
                    type="email"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={paypalEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)}
                    className={cn(
                      paypalEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail) && 'border-destructive focus-visible:ring-destructive',
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail) && 'border-success focus-visible:ring-success',
                    )}
                  />
                  {paypalEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail) ? (
                    <p className="text-xs text-destructive">Enter valid PayPal email</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Payouts will be sent to this PayPal account.</p>
                  )}
                </div>
              )}

              <Button
                className="w-full" onClick={handleSavePayment}
                disabled={
                  savingPayment ||
                  (payoutCountry === 'IN'
                    ? (accountHolderName.trim().length < 2 || !upiId || !isValidUpi(upiId) || bankAccountNumber.length < 9 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode))
                    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail))
                }
              >
                {savingPayment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Payment Details
              </Button>
              {profile?.updated_at && (upiId || accountHolderName || bankAccountNumber || ifscCode || paypalEmail) && (
                <p className="text-xs text-muted-foreground text-center">
                  Last updated: {format(new Date(profile.updated_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECURITY / 2FA */}
        <TabsContent value="security">
          <TwoFactorSection />
        </TabsContent>
      </Tabs>

      <SupportWidget />
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, tone, loading, isHero,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: string;
  loading?: boolean;
  isHero?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-none">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
        <Icon className={cn('h-3.5 w-3.5', isHero ? 'text-[#06B6D4]' : 'text-[#06B6D4]')} />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-1 font-display text-lg font-bold tabular-nums', isHero ? 'text-[#06B6D4]' : 'text-[#0A1628]')}>
        {loading ? '…' : value}
      </p>
    </div>
  );
}

function SkillCard({
  label, selected, onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
        selected
          ? 'border-[#06B6D4] bg-[rgba(6,182,212,0.08)] text-[#0A1628] font-medium'
          : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-slate-50',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          selected
            ? 'bg-[#06B6D4] border-[#06B6D4] text-white'
            : 'border-[#E5E7EB] bg-white',
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span className="flex-1 leading-snug">{label}</span>
    </button>
  );
}
