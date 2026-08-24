import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle2, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const INDIAN_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'ur', label: 'Urdu' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'or', label: 'Odia' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'as', label: 'Assamese' },
  { value: 'mai', label: 'Maithili' },
  { value: 'sa', label: 'Sanskrit' },
  { value: 'mni', label: 'Manipuri' },
  { value: 'sd', label: 'Sindhi' },
  { value: 'doi', label: 'Dogri' },
  { value: 'ks', label: 'Kashmiri' },
];

const HOURS_OPTIONS = [
  { value: 'lt5', label: 'Less than 5 hours' },
  { value: '5-10', label: '5–10 hours' },
  { value: '10-20', label: '10–20 hours' },
  { value: '20+', label: '20+ hours' },
];

const SKILL_OPTIONS = [
  'Text Annotation', 'Audio Transcription', 'Video Labeling', 'Image Tagging',
  'Translation', 'Transliteration', 'Data Collection', 'Quality Review',
  'Sentiment Analysis', 'Named Entity Recognition', 'OCR Correction',
  'Speech Recording', 'Content Moderation', 'Summarization', 'Question Answering',
];

const COUNTRY_OPTIONS = [
  { value: 'India', label: 'India 🇮🇳' },
  { value: 'Philippines', label: 'Philippines 🇵🇭' },
];

const STATUS_OPTIONS = [
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
  { value: 'ug', label: 'UG (Undergraduate)' },
  { value: 'working_professional', label: 'Working Professional' },
];

const SECTION_LABELS = ['Personal Info', 'Professional Details', 'Languages & Skills'];

export default function CompleteProfile() {
  const { user, fetchProfile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Section 1 — Personal Info
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Section 2 — Professional Details
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('');

  // Section 3 — Languages & Skills
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [skills, setSkills] = useState<string[]>([]);

  const toggleLanguage = (val: string) =>
    setLanguages((prev) => prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val]);

  const toggleSkill = (val: string) =>
    setSkills((prev) => prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]);

  const progressPercent = useMemo(() => {
    let filled = 0;
    const total = 3;
    if (fullName.trim() && phone.trim() && country && currentStatus) filled++;
    if (hoursPerWeek) filled++;
    if (languages.length > 0 && skills.length > 0) filled++;
    return Math.round((filled / total) * 100);
  }, [fullName, phone, country, currentStatus, hoursPerWeek, languages, skills]);

  const validateStep = (): boolean => {
    if (step === 0) {
      if (!fullName.trim()) { toast.error('Full name is required'); return false; }
      if (!phone.trim()) { toast.error('Phone number is required'); return false; }
      if (!country) { toast.error('Please select your country'); return false; }
      if (!currentStatus) { toast.error('Please select your current status'); return false; }
    }
    if (step === 1) {
      if (!hoursPerWeek) { toast.error('Select your weekly availability'); return false; }
    }
    if (step === 2) {
      if (languages.length === 0) { toast.error('Select at least one language'); return false; }
      if (skills.length === 0) { toast.error('Select at least one skill'); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, 2));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    if (!user) return;
    setSaving(true);
    try {
      let avatar_url: string | null = null;
      let resume_url: string | null = null;

      if (avatarFile) {
        const ext = (avatarFile.name.split('.').pop() || 'png').toLowerCase();
        const path = `${user.id}/avatar.${ext}`;
        const { error: avatarErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (avatarErr) throw avatarErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        avatar_url = `${urlData.publicUrl}?v=${Date.now()}`;
      }

      if (resumeFile) {
        const path = `${user.id}/resume.pdf`;
        const { error: resumeErr } = await supabase.storage
          .from('resumes')
          .upload(path, resumeFile, { upsert: true });
        if (resumeErr) throw resumeErr;
        resume_url = path;
      }

      const updates: Record<string, unknown> = {
        display_name: fullName.trim(),
        phone: phone.trim(),
        country: country || null,
        current_status: currentStatus || null,
        linkedin_url: linkedinUrl.trim() || null,
        github_url: githubUrl.trim() || null,
        hours_per_week: hoursPerWeek,
        language: languages,
        skills,
        profile_completed: true,
        onboarding_complete: true,
      };
      if (avatar_url) updates.avatar_url = avatar_url;
      if (resume_url) updates.resume_url = resume_url;

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (error) throw error;
      await fetchProfile(user.id);
      toast.success("Profile complete — let's go!");
      navigate(returnTo || '/app', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <Label>Country *</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder="Select your country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Status *</Label>
              <Select value={currentStatus} onValueChange={setCurrentStatus}>
                <SelectTrigger><SelectValue placeholder="Select your current status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-3 hover:border-primary/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{avatarFile ? avatarFile.name : 'Upload a photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resume (PDF)</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-3 hover:border-primary/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{resumeFile ? resumeFile.name : 'Upload your resume'}</span>
                <input type="file" accept=".pdf" className="hidden" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn Profile URL</Label>
              <Input id="linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github">GitHub Profile URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="github" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/yourname" />
            </div>
            <div className="space-y-2">
              <Label>Hours Available Per Week *</Label>
              <Select value={hoursPerWeek} onValueChange={setHoursPerWeek}>
                <SelectTrigger><SelectValue placeholder="Select availability" /></SelectTrigger>
                <SelectContent>
                  {HOURS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Preferred Languages *</Label>
              <p className="text-xs text-muted-foreground">Select the languages you can work with</p>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 max-h-52 overflow-y-auto">
                {INDIAN_LANGUAGES.map((l) => (
                  <label key={l.value} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                    <Checkbox checked={languages.includes(l.value)} onCheckedChange={() => toggleLanguage(l.value)} />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Skills *</Label>
              <p className="text-xs text-muted-foreground">Select the skills relevant to your experience</p>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => {
                  const selected = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg space-y-6"
      >
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Sparkles className="h-6 w-6 text-primary shrink-0" />
          <div>
            <p className="font-display text-sm font-bold text-foreground">
              Start earning — complete your profile first!
            </p>
            <p className="text-xs text-muted-foreground">
              Fill in the details below to unlock projects and start contributing.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {step + 1} of 3: {SECTION_LABELS[step]}</span>
            <span>{progressPercent}% complete</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between">
            {SECTION_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => { if (i < step) setStep(i); }}
                className={`text-[10px] font-medium transition-colors ${
                  i === step ? 'text-primary' : i < step ? 'text-muted-foreground cursor-pointer hover:text-foreground' : 'text-muted-foreground/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-display text-xl">{SECTION_LABELS[step]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button variant="outline" className="flex-1" onClick={prevStep}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
              {step < 2 ? (
                <Button className="flex-1" onClick={nextStep}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button className="flex-1" variant="hero" onClick={handleSubmit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {saving ? 'Saving…' : 'Complete Profile & Start'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
