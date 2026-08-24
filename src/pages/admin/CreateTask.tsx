import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createTask, updateTask, fetchMyLatestDraft, deleteTask } from '@/services/projectService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, CalendarIcon, Plus, X, Upload,
  Loader2 as UploadSpinner, Users, Check, CircleDashed,
  Cloud, CloudOff, FileText, ListChecks, Image as ImageIcon,
  Settings, Wallet, Calendar as CalendarLucide, BookOpen,
} from 'lucide-react';
import MultiSelectCombobox from '@/components/profile/MultiSelectCombobox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTaskDraftAutosave, readLocalDraft, clearLocalDraft } from '@/hooks/useTaskDraftAutosave';
import { CategoriesEditor, type ProjectCategory } from '@/components/admin/CategoriesEditor';
import { ExampleMediaEditor, type ExampleMediaItem, inferMediaType } from '@/components/admin/ExampleMediaEditor';

// ---------- Targeting option lists ----------
const TARGET_LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' }, { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' }, { value: 'ta', label: 'Tamil' },
  { value: 'ur', label: 'Urdu' }, { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' }, { value: 'or', label: 'Odia' },
  { value: 'ml', label: 'Malayalam' }, { value: 'pa', label: 'Punjabi' },
  { value: 'as', label: 'Assamese' }, { value: 'mai', label: 'Maithili' },
  { value: 'sa', label: 'Sanskrit' }, { value: 'mni', label: 'Manipuri' },
  { value: 'sd', label: 'Sindhi' }, { value: 'doi', label: 'Dogri' },
  { value: 'ks', label: 'Kashmiri' }, { value: 'fil', label: 'Filipino' },
];
const TARGET_GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];
const TARGET_STATUS = [
  { value: 'student', label: 'Student' },
  { value: 'working_professional', label: 'Employed' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'freelancer', label: 'Freelancer' },
];
const TARGET_PROFESSIONS = [
  { value: 'Engineer', label: 'Engineer' }, { value: 'Doctor', label: 'Doctor' },
  { value: 'Lawyer', label: 'Lawyer' }, { value: 'Teacher', label: 'Teacher' },
  { value: 'Designer', label: 'Designer' }, { value: 'Developer', label: 'Developer' },
  { value: 'Other', label: 'Other' },
];
const TARGET_SKILLS = [
  'AI Data Labeling', 'Language Translator (English to 22 languages)',
  'Data Pre-processor', 'Video Editor', 'Prompt Analyzer',
  'Finance & Accounting Specialist', 'VFX Artist', 'UI/UX Designer',
  'Technical Content Writer', 'Prompt Engineer', 'K–12 Teacher',
  'Software Programmer (Beginner)', 'Software Programmer (Advanced)',
  'Legal Consultant (Lawyer)', 'Language Teacher',
].map((s) => ({ value: s, label: s }));

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

// ---------- Schema (publish-time) ----------
const formSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120),
  overview: z
    .string()
    .trim()
    .min(20, 'Overview must be at least 20 characters')
    .max(1000, 'Overview cannot exceed 1000 characters'),
  instructions: z.string().refine((v) => stripHtml(v).length >= 20, { message: 'Description must be at least 20 characters' }),
  media_type: z.enum(['text', 'audio', 'image', 'video']),
  duration_label: z.string().trim().min(1, 'Duration is required').max(50),
  total_tasks: z.coerce.number().int().positive().max(10000),
  visible_till: z.date({ required_error: 'Deadline is required', invalid_type_error: 'Deadline is required' }),
  status: z.enum(['draft', 'active']),
  pay_per_task: z.coerce.number().min(0),
  reward_tokens: z.coerce.number().int().min(0).optional().default(0),
  payment_terms: z.enum(['on_completion', 'weekly', 'monthly']),
  start_date: z.date({ required_error: 'Start date is required', invalid_type_error: 'Start date is required' }),
  end_date: z.date({ required_error: 'End date is required', invalid_type_error: 'End date is required' }),
  max_file_size_mb: z.union([z.coerce.number().int().positive().max(2048), z.literal('').transform(() => undefined)]).optional(),
  visibility_type: z.enum(['everyone', 'targeted']).default('everyone'),
  target_gender: z.array(z.string()).default([]),
  target_languages: z.array(z.string()).default([]),
  target_skills: z.array(z.string()).default([]),
  target_status: z.array(z.string()).default([]),
  target_profession: z.array(z.string()).default([]),
  has_guidelines_hub: z.boolean().default(false),
  slug: z.string().trim().optional(),
  short_description: z.string().trim().optional(),
  platform_url: z.string().trim().optional(),
  referral_code: z.string().trim().optional(),
  discord_url: z.string().trim().optional(),
  community_url: z.string().trim().optional(),
  guidelines_doc_url: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.start_date && data.end_date && data.start_date > data.end_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_date'], message: 'End Date must be on or after Start Date' });
  }
  if (data.visible_till && data.start_date && data.visible_till < data.start_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['visible_till'], message: 'Visible Till must be after Start Date' });
  }
  if (data.visibility_type === 'targeted') {
    const total =
      data.target_gender.length + data.target_languages.length +
      data.target_skills.length + data.target_status.length + data.target_profession.length;
    if (total === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['visibility_type'], message: 'Select at least one filter or change to Everyone' });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  title: '', overview: '', instructions: '',
  media_type: 'text', duration_label: '', total_tasks: 10,
  visible_till: undefined as any, status: 'active',
  pay_per_task: 0, reward_tokens: 0, payment_terms: 'on_completion',
  start_date: undefined as any, end_date: undefined as any,
  max_file_size_mb: undefined,
  visibility_type: 'everyone',
  target_gender: [], target_languages: [], target_skills: [],
  target_status: [], target_profession: [],
  has_guidelines_hub: false,
  slug: '', short_description: '', platform_url: '', referral_code: '',
  discord_url: '', community_url: '', guidelines_doc_url: '',
};

const BASE_SECTIONS = [
  { id: 'basics', label: 'Basic Info', icon: FileText },
  { id: 'categories', label: 'Task Categories', icon: ListChecks },
  { id: 'instructions', label: 'Instructions', icon: ListChecks },
  { id: 'guidelines', label: 'Guidelines & Media', icon: ImageIcon },
  { id: 'compensation', label: 'Compensation', icon: Wallet },
  { id: 'access', label: 'Access & Launch', icon: Settings },
  { id: 'onboarding', label: 'Guidelines & Onboarding', icon: BookOpen },
] as const;

const CATEGORIES_LS_KEY = 'createTaskCategories:v1';

export default function CreateTask() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectType: 'normal' | 'category' = searchParams.get('type') === 'category' ? 'category' : 'normal';
  const isCategoryProject = projectType === 'category';

  // Conditionally include the "Task Categories" section only for category-type projects
  const SECTIONS = useMemo(
    () => BASE_SECTIONS.filter((s) => s.id !== 'categories' || isCategoryProject),
    [isCategoryProject],
  );

  // Categories state (only relevant when isCategoryProject)
  const [categories, setCategories] = useState<ProjectCategory[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(CATEGORIES_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.categories) ? parsed.categories : [];
    } catch { return []; }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'all',
    defaultValues,
  });

  // Extra state outside react-hook-form
  const [dosItems, setDosItems] = useState<string[]>([]);
  const [dontsItems, setDontsItems] = useState<string[]>([]);
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');
  const [extraErrors, setExtraErrors] = useState<{ dos?: string; donts?: string; samples?: string }>({});
  const [sampleMediaUrls, setSampleMediaUrls] = useState<string[]>([]);
  const [exampleMedia, setExampleMedia] = useState<ExampleMediaItem[]>([]);
  const [uploadingSample, setUploadingSample] = useState(false);

  // Resume-draft modal
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState<{ id: string; values: Partial<FormValues>; dos: string[]; donts: string[]; samples: string[]; examples: ExampleMediaItem[]; updatedAt: string } | null>(null);
  const initRan = useRef(false);

  // ---------- Build payload for autosave ----------
  const buildPayload = () => {
    const v = form.getValues();
    const match = v.duration_label?.match(/\d+/);
    const durationMin = match ? parseInt(match[0], 10) : null;
    const targetFilters: Record<string, string[]> = {};
    if (v.target_gender?.length) targetFilters.gender = v.target_gender;
    if (v.target_languages?.length) targetFilters.languages = v.target_languages;
    if (v.target_skills?.length) targetFilters.skills = v.target_skills;
    if (v.target_status?.length) targetFilters.status = v.target_status;
    if (v.target_profession?.length) targetFilters.profession = v.target_profession;

    // Drafts: only persist non-empty title (title is NOT NULL on projects).
    const titleTrim = (v.title ?? '').trim();
    if (!titleTrim) return null;

    return {
      title: titleTrim,
      overview: v.overview?.trim() || null,
      instructions: v.instructions || '',
      media_type: v.media_type,
      duration_minutes: durationMin,
      duration_label: v.duration_label || null,
      total_tasks: Number(v.total_tasks) || 1,
      languages: [],
      visible_till: v.visible_till ? new Date(v.visible_till).toISOString() : null,
      pay_per_task: Number(v.pay_per_task) || 0,
      reward_tokens: Number(v.reward_tokens) || 0,
      payment_terms: v.payment_terms,
      start_date: v.start_date ? new Date(v.start_date).toISOString() : null,
      end_date: v.end_date ? new Date(v.end_date).toISOString() : null,
      dos: dosItems,
      donts: dontsItems,
      sample_media_urls: exampleMedia.length > 0 ? exampleMedia.map((e) => e.url) : sampleMediaUrls,
      example_media: exampleMedia,
      max_file_size_mb: v.max_file_size_mb ? Number(v.max_file_size_mb) : null,
      visibility_type: v.visibility_type,
      target_filters: targetFilters,
      has_guidelines_hub: v.has_guidelines_hub ?? false,
      slug: v.slug?.trim() || null,
      short_description: v.short_description?.trim() || null,
      platform_url: v.platform_url?.trim() || null,
      referral_code: v.referral_code?.trim() || null,
      discord_url: v.discord_url?.trim() || null,
      community_url: v.community_url?.trim() || null,
      guidelines_doc_url: v.guidelines_doc_url?.trim() || null,
    } as any;
  };

  const buildBackup = () => ({
    values: form.getValues(),
    dosItems, dontsItems, sampleMediaUrls, exampleMedia,
  });

  const autosaveEnabled = !resumeOpen; // Don't autosave while modal is up
  const { draftId, setDraftId, status: saveStatus, lastSavedAt, schedule, flushNow } =
    useTaskDraftAutosave({ userId: user?.id, enabled: autosaveEnabled, buildPayload, buildBackup });

  // Schedule autosave whenever any field, dos/donts, or samples change
  useEffect(() => {
    const sub = form.watch(() => schedule());
    return () => sub.unsubscribe();
  }, [form, schedule]);
  useEffect(() => { schedule(); /* eslint-disable-next-line */ }, [dosItems, dontsItems, sampleMediaUrls, exampleMedia]);

  // Categories autosave: persist to localStorage on every change, and sync to DB
  // (debounced) when we have a draftId.
  useEffect(() => {
    if (!isCategoryProject) return;
    try {
      localStorage.setItem(CATEGORIES_LS_KEY, JSON.stringify({ categories, savedAt: Date.now() }));
    } catch { /* noop */ }
  }, [categories, isCategoryProject]);

  useEffect(() => {
    if (!isCategoryProject || !draftId) return;
    const t = setTimeout(async () => {
      try {
        await supabase.from('project_categories').delete().eq('project_id', draftId);
        if (categories.length > 0) {
          await supabase.from('project_categories').insert(
            categories.map((c, i) => ({
              project_id: draftId,
              category_name: c.category_name.trim(),
              welcome_message: c.welcome_message?.trim() || null,
              category_overview: c.category_overview?.trim() || null,
              sort_order: i,
            })),
          );
        }
      } catch (e) {
        console.warn('[categories autosave]', e);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [categories, draftId, isCategoryProject]);

  // Flush on tab close / blur
  useEffect(() => {
    const onBlur = () => { void flushNow(); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBlur);
    };
  }, [flushNow]);

  // ---------- Resume draft on mount ----------
  // Heuristic: only prompt if a meaningful draft exists.
  const isMeaningfulDraft = (vals: any, dos: string[], donts: string[], samples: string[]) => {
    const filled = [
      (vals?.title ?? '').toString().trim().length >= 3,
      (vals?.overview ?? '').toString().trim().length > 0,
      stripHtml(vals?.instructions ?? '').length > 0,
      Number(vals?.pay_per_task) > 0,
      !!vals?.start_date, !!vals?.end_date, !!vals?.visible_till,
      dos.length > 0, donts.length > 0, samples.length > 0,
    ].filter(Boolean).length;
    return (vals?.title ?? '').toString().trim().length >= 3 && filled >= 2;
  };

  useEffect(() => {
    if (initRan.current || !user?.id) return;
    initRan.current = true;
    (async () => {
      try {
        const remote = await fetchMyLatestDraft(user.id);
        const local = readLocalDraft();

        let candidate: typeof resumeCandidate = null;
        if (remote) {
          const useLocal = local && local.draftId === remote.id;
          const tf = (remote.target_filters ?? {}) as any;
          const seedValues: Partial<FormValues> = useLocal && local
            ? (local.values as any)
            : {
                title: remote.title ?? '',
                overview: remote.overview ?? '',
                instructions: remote.instructions ?? '',
                media_type: remote.media_type as any,
                duration_label: remote.duration_label ?? '',
                total_tasks: remote.total_tasks ?? 10,
                visible_till: remote.visible_till ? new Date(remote.visible_till) : (undefined as any),
                status: 'draft',
                pay_per_task: Number(remote.pay_per_task ?? 0),
                reward_tokens: remote.reward_tokens ?? 0,
                payment_terms: (remote.payment_terms as any) ?? 'on_completion',
                start_date: remote.start_date ? new Date(remote.start_date) : (undefined as any),
                end_date: remote.end_date ? new Date(remote.end_date) : (undefined as any),
                max_file_size_mb: remote.max_file_size_mb ?? undefined,
                visibility_type: (remote.visibility_type as any) ?? 'everyone',
                target_gender: tf.gender ?? [],
                target_languages: tf.languages ?? [],
                target_skills: tf.skills ?? [],
                target_status: tf.status ?? [],
                target_profession: tf.profession ?? [],
              };
          const remoteExamples: ExampleMediaItem[] = Array.isArray((remote as any).example_media)
            ? (remote as any).example_media
            : [];
          const localExamples: ExampleMediaItem[] = Array.isArray((local as any)?.exampleMedia)
            ? (local as any).exampleMedia
            : [];
          candidate = {
            id: remote.id,
            values: seedValues,
            dos: useLocal && local ? local.dosItems : (remote.dos ?? []),
            donts: useLocal && local ? local.dontsItems : (remote.donts ?? []),
            samples: useLocal && local ? local.sampleMediaUrls : (remote.sample_media_urls ?? []),
            examples: useLocal ? localExamples : remoteExamples,
            updatedAt: remote.updated_at,
          };
        } else if (local && !local.draftId) {
          candidate = {
            id: '',
            values: local.values as any,
            dos: local.dosItems, donts: local.dontsItems, samples: local.sampleMediaUrls,
            examples: Array.isArray((local as any).exampleMedia) ? (local as any).exampleMedia : [],
            updatedAt: new Date(local.savedAt).toISOString(),
          };
        }

        if (!candidate) return;

        const ageMs = Date.now() - new Date(candidate.updatedAt).getTime();
        const within24h = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
        const meaningful = isMeaningfulDraft(candidate.values, candidate.dos, candidate.donts, candidate.samples);

        if (!within24h || !meaningful) {
          // Silently adopt existing draft id so autosave updates instead of creating a duplicate.
          if (candidate.id) setDraftId(candidate.id);
          return;
        }

        setResumeCandidate(candidate);
        setResumeOpen(true);
      } catch (e) {
        console.warn('Failed to load draft', e);
      }
    })();
  }, [user?.id, setDraftId]);

  // Periodic safety autosave every 10s
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(() => { schedule(); }, 10000);
    return () => clearInterval(t);
  }, [user?.id, schedule]);

  const acceptResume = () => {
    if (!resumeCandidate) return;
    const v = resumeCandidate.values as any;
    // Re-hydrate Dates that were JSON-serialized
    const dateify = (k: keyof FormValues) => {
      const raw = v[k];
      if (raw && !(raw instanceof Date)) v[k] = new Date(raw);
    };
    dateify('visible_till'); dateify('start_date'); dateify('end_date');
    form.reset({ ...defaultValues, ...v });
    setDosItems(resumeCandidate.dos);
    setDontsItems(resumeCandidate.donts);
    setSampleMediaUrls(resumeCandidate.samples);
    setExampleMedia(resumeCandidate.examples ?? []);
    if (resumeCandidate.id) {
      setDraftId(resumeCandidate.id);
      // Hydrate categories from DB for category-type projects
      if (isCategoryProject) {
        (async () => {
          const { data } = await supabase
            .from('project_categories')
            .select('id, category_name, welcome_message, category_overview')
            .eq('project_id', resumeCandidate.id)
            .order('sort_order', { ascending: true });
          if (data && data.length > 0) {
            setCategories(data.map((d: any) => ({
              id: d.id,
              category_name: d.category_name ?? '',
              welcome_message: d.welcome_message ?? '',
              category_overview: d.category_overview ?? '',
            })));
          }
        })();
      }
    }
    setResumeOpen(false);
    toast.success('Draft restored');
  };

  const discardDraft = async () => {
    try {
      if (resumeCandidate?.id) await deleteTask(resumeCandidate.id);
    } catch (e) { console.warn('discard remote failed', e); }
    clearLocalDraft();
    setResumeCandidate(null);
    setResumeOpen(false);
    toast.message('Draft discarded — starting fresh');
  };

  // ---------- Sample upload ----------
  const handleSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      toast.error('File size exceeds 500 MB. Please compress or use an external link (Drive, Dropbox, etc.).');
      return;
    }
    setUploadingSample(true);
    try {
      const path = `samples/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('task-media').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('task-media').getPublicUrl(path);
      setSampleMediaUrls(p => [...p, urlData.publicUrl]);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingSample(false);
      e.target.value = '';
    }
  };

  // ---------- Publish mutation ----------
  const publishMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const match = values.duration_label.match(/\d+/);
      const durationMin = match ? parseInt(match[0], 10) : null;
      const targetFilters: Record<string, string[]> = {};
      if (values.target_gender.length) targetFilters.gender = values.target_gender;
      if (values.target_languages.length) targetFilters.languages = values.target_languages;
      if (values.target_skills.length) targetFilters.skills = values.target_skills;
      if (values.target_status.length) targetFilters.status = values.target_status;
      if (values.target_profession.length) targetFilters.profession = values.target_profession;

      const payload: any = {
        title: values.title,
        overview: values.overview?.trim() || null,
        instructions: values.instructions,
        media_type: values.media_type,
        duration_minutes: durationMin,
        duration_label: values.duration_label,
        total_tasks: values.total_tasks,
        languages: [],
        status: values.status,
        visible_till: values.visible_till.toISOString(),
        pay_per_task: values.pay_per_task,
        reward_tokens: values.reward_tokens ?? 0,
        payment_terms: values.payment_terms,
        start_date: values.start_date.toISOString(),
        end_date: values.end_date.toISOString(),
        dos: dosItems, donts: dontsItems,
        sample_media_urls: exampleMedia.length > 0 ? exampleMedia.map((e) => e.url) : sampleMediaUrls,
        example_media: exampleMedia,
        max_file_size_mb: values.max_file_size_mb ? Number(values.max_file_size_mb) : null,
        visibility_type: values.visibility_type,
        target_filters: targetFilters,
        project_type: projectType,
        has_guidelines_hub: values.has_guidelines_hub ?? false,
        slug: values.slug?.trim() || null,
        short_description: values.short_description?.trim() || null,
        platform_url: values.platform_url?.trim() || null,
        referral_code: values.referral_code?.trim() || null,
        discord_url: values.discord_url?.trim() || null,
        community_url: values.community_url?.trim() || null,
        guidelines_doc_url: values.guidelines_doc_url?.trim() || null,
      };
      let projectId: string;
      if (draftId) {
        const updated = await updateTask(draftId, payload);
        projectId = updated.id;
      } else {
        const created = await createTask({ ...payload, created_by: user?.id ?? null });
        projectId = created.id;
      }

      // Sync category rows for category-type projects
      if (isCategoryProject) {
        await supabase.from('project_categories').delete().eq('project_id', projectId);
        if (categories.length > 0) {
          const { error } = await supabase.from('project_categories').insert(
            categories.map((c, i) => ({
              project_id: projectId,
              category_name: c.category_name.trim(),
              welcome_message: c.welcome_message?.trim() || null,
              category_overview: c.category_overview?.trim() || null,
              sort_order: i,
            })),
          );
          if (error) throw error;
        }
      }
      return { id: projectId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
      clearLocalDraft();
      try { localStorage.removeItem(CATEGORIES_LS_KEY); } catch { /* noop */ }
      toast.success(isCategoryProject ? 'Category project created successfully' : 'Task created successfully');
      navigate('/admin/tasks');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create task'),
  });

  const validateExtras = () => {
    const errs: typeof extraErrors = {};
    if (dosItems.length === 0) errs.dos = "Add at least one Do item";
    if (dontsItems.length === 0) errs.donts = "Add at least one Don't item";
    if (exampleMedia.length === 0 && sampleMediaUrls.length === 0) errs.samples = 'Add at least one example (good or bad)';
    setExtraErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = (values: FormValues) => {
    if (!validateExtras()) {
      toast.error('Please complete all required fields');
      return;
    }
    publishMutation.mutate(values);
  };

  const onInvalid = () => { validateExtras(); toast.error('Please fix the highlighted fields'); };

  // ---------- Section completion ----------
  const watched = form.watch();
  const sectionDone = useMemo(() => ({
    basics: !!watched.title?.trim() && !!watched.overview?.trim() && !!watched.media_type && !!watched.duration_label?.trim(),
    categories: !isCategoryProject || categories.length >= 1,
    instructions: !!watched.instructions && stripHtml(watched.instructions).length >= 20,
    guidelines: dosItems.length >= 1 && dontsItems.length >= 1 && (exampleMedia.length >= 1 || sampleMediaUrls.length >= 1),
    compensation: Number(watched.pay_per_task) >= 0 && !!watched.payment_terms && !!watched.start_date && !!watched.end_date,
    access: !!watched.visibility_type && !!watched.status && !!watched.visible_till && Number(watched.total_tasks) > 0,
  }), [watched, dosItems.length, dontsItems.length, sampleMediaUrls.length, exampleMedia.length, isCategoryProject, categories.length]);

  const doneCount = Object.values(sectionDone).filter(Boolean).length;
  const percent = Math.round((doneCount / SECTIONS.length) * 100);
  const allDone = doneCount === SECTIONS.length;

  // ---------- Save status pill ----------
  const saveLabel = (() => {
    if (saveStatus === 'saving') return 'Saving…';
    if (saveStatus === 'error') return 'Failed to save. Retrying…';
    if (saveStatus === 'saved' && lastSavedAt) return `Saved ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}`;
    if (draftId) return 'Draft loaded';
    return 'Not saved yet';
  })();

  return (
    <div className="animate-slide-up max-w-3xl mx-auto pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={async () => { await flushNow(); navigate('/admin/tasks'); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold leading-tight truncate">
              {watched.title?.trim() || (projectType === 'category' ? 'Create Category Project' : 'Create New Project')}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
                saveStatus === 'error' ? 'border-destructive/40 text-destructive' :
                saveStatus === 'saving' ? 'border-primary/40 text-primary' :
                'border-border'
              )}>
                {saveStatus === 'error' ? <CloudOff className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                <span>Draft • {saveLabel}</span>
              </span>
              <span className="hidden sm:inline">• {doneCount} of {SECTIONS.length} sections • {percent}%</span>
            </div>
          </div>
          {/* Action buttons moved to sticky bottom bar */}
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded bg-border">
          <div
            className={cn('h-full transition-all', allDone ? 'bg-success' : 'bg-primary')}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Section chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => {
            const done = (sectionDone as any)[s.id];
            return (
              <button
                key={s.id} type="button"
                onClick={() => document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  done ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          {/* ============ Section: Basic Info ============ */}
          <SectionCard id="basics" title="Basic Info" subtitle="Title, summary, and content type" icon={FileText} done={sectionDone.basics}>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Record greeting in your language" {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="overview" render={({ field }) => {
              const len = (field.value ?? '').length;
              const pct = len / 1000;
              const counterColor = len >= 1000 ? 'text-destructive' : pct >= 0.8 ? 'text-orange-500' : 'text-muted-foreground';
              return (
                <FormItem>
                  <FormLabel>Overview <span className="text-xs text-muted-foreground font-normal">(short summary)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      maxLength={1000}
                      placeholder="Briefly describe the task (2–5 lines). Include key expectations, perspective, and constraints."
                      className="min-h-[88px] max-h-[240px] resize-y"
                      {...field}
                      onBlur={() => { field.onBlur(); flushNow(); }}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {len > 300 ? 'For detailed instructions, use the Full Description section below.' : ''}
                    </span>
                    <span className={`text-xs ${counterColor}`}>{len} / 1000 characters</span>
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="media_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Media Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="text">📝 Text</SelectItem>
                      <SelectItem value="audio">🎙️ Audio</SelectItem>
                      <SelectItem value="image">📸 Image</SelectItem>
                      <SelectItem value="video">🎬 Video</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="duration_label" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <FormControl><Input placeholder='e.g. "2-6 mins"' {...field} onBlur={() => { field.onBlur(); flushNow(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </SectionCard>

          {/* ============ Section: Task Categories (category projects only) ============ */}
          {isCategoryProject && (
            <SectionCard
              id="categories"
              title="Task Categories"
              subtitle="Define the activity categories contributors can submit under"
              icon={ListChecks}
              done={sectionDone.categories}
            >
              <CategoriesEditor categories={categories} onChange={setCategories} />
            </SectionCard>
          )}

          {/* ============ Section: Instructions ============ */}
          <SectionCard id="instructions" title="Instructions for Contributors" subtitle="Detailed walkthrough" icon={ListChecks} done={sectionDone.instructions}>
            <FormField control={form.control} name="instructions" render={({ field }) => (
              <FormItem>
                <FormLabel>Full Description</FormLabel>
                <FormControl>
                  <RichTextEditor value={field.value} onChange={field.onChange} placeholder="Step-by-step instructions for contributors…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          {/* ============ Section: Guidelines & Sample Media ============ */}
          <SectionCard id="guidelines" title="Guidelines & Reference" subtitle="Do's, Don'ts, and sample media" icon={ImageIcon} done={sectionDone.guidelines}>
            <div>
              <FormLabel>Do's <span className="text-xs text-destructive">*</span></FormLabel>
              <div className="mt-2 flex gap-2">
                <Input value={newDo} onChange={(e) => setNewDo(e.target.value)} placeholder="Add a do item…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newDo.trim()) { setDosItems(p => [...p, newDo.trim()]); setNewDo(''); setExtraErrors(p => ({ ...p, dos: undefined })); } } }}
                  className={cn(extraErrors.dos && 'border-destructive')}
                />
                <Button type="button" size="icon" variant="outline" onClick={() => { if (newDo.trim()) { setDosItems(p => [...p, newDo.trim()]); setNewDo(''); setExtraErrors(p => ({ ...p, dos: undefined })); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {extraErrors.dos && <p className="mt-1 text-sm font-medium text-destructive">{extraErrors.dos}</p>}
              <div className="mt-2 space-y-1.5">
                {dosItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="text-success">✓</span>
                    <span className="flex-1">{item}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDosItems(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <FormLabel>Don'ts <span className="text-xs text-destructive">*</span></FormLabel>
              <div className="mt-2 flex gap-2">
                <Input value={newDont} onChange={(e) => setNewDont(e.target.value)} placeholder="Add a don't item…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newDont.trim()) { setDontsItems(p => [...p, newDont.trim()]); setNewDont(''); setExtraErrors(p => ({ ...p, donts: undefined })); } } }}
                  className={cn(extraErrors.donts && 'border-destructive')}
                />
                <Button type="button" size="icon" variant="outline" onClick={() => { if (newDont.trim()) { setDontsItems(p => [...p, newDont.trim()]); setNewDont(''); setExtraErrors(p => ({ ...p, donts: undefined })); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {extraErrors.donts && <p className="mt-1 text-sm font-medium text-destructive">{extraErrors.donts}</p>}
              <div className="mt-2 space-y-1.5">
                {dontsItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="text-destructive">✗</span>
                    <span className="flex-1">{item}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDontsItems(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4 mb-1">
                <FormLabel className="mb-0">Example Media <span className="text-xs text-destructive">*</span></FormLabel>
                <span className="text-xs text-muted-foreground">
                  Shared across all categories
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Show contributors what a great submission looks like — and what to avoid.
                Upload images, video, or audio (up to 1 GB), or paste Drive / Dropbox / OneDrive links.
              </p>
              <div className="mt-3">
                <ExampleMediaEditor
                  items={exampleMedia}
                  onChange={(next) => {
                    setExampleMedia(next);
                    setExtraErrors((p) => ({ ...p, samples: undefined }));
                  }}
                />
              </div>
              {extraErrors.samples && <p className="mt-2 text-sm font-medium text-destructive">{extraErrors.samples}</p>}

              {/* Legacy unstructured samples — only shown if present from older drafts */}
              {sampleMediaUrls.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Legacy sample files</p>
                  <div className="space-y-1.5">
                    {sampleMediaUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <span className="flex-1 truncate text-xs">{url.split('/').pop()}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSampleMediaUrls(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ============ Section: Compensation & Timeline ============ */}
          <SectionCard id="compensation" title="Compensation & Timeline" subtitle="Pay, tokens, and dates" icon={Wallet} done={sectionDone.compensation}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="pay_per_task" render={({ field }) => (
                <FormItem>
                  <FormLabel>Pay Per Hour (₹)</FormLabel>
                  <FormControl><Input type="number" min={0} step="0.01" {...field} onBlur={() => { field.onBlur(); flushNow(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reward_tokens" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reward Tokens <span className="text-xs text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input type="number" min={0} step="1" {...field} onBlur={() => { field.onBlur(); flushNow(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="payment_terms" render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Terms</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="on_completion">On Completion</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DateField control={form.control} name="start_date" label="Task Start Date" />
              <DateField control={form.control} name="end_date" label="Task End Date" />
            </div>

            {form.watch('media_type') !== 'text' && (
              <FormField control={form.control} name="max_file_size_mb" render={({ field }) => {
                const mt = form.watch('media_type') as 'image' | 'video' | 'audio';
                const defaultMb = mt === 'image' ? 10 : mt === 'video' ? 100 : 50;
                return (
                  <FormItem>
                    <FormLabel>Max Submission File Size (MB) <span className="text-xs text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={2048} placeholder={`Default: ${defaultMb} MB`}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Leave empty to use the default for {mt} ({defaultMb} MB).</p>
                    <FormMessage />
                  </FormItem>
                );
              }} />
            )}
          </SectionCard>

          {/* ============ Section: Access & Launch ============ */}
          <SectionCard id="access" title="Access Control & Launch" subtitle="Who sees it, when, and initial state" icon={Settings} done={sectionDone.access}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="total_tasks" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Tasks</FormLabel>
                  <FormControl><Input type="number" min={1} max={10000} {...field} onBlur={() => { field.onBlur(); flushNow(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DateField control={form.control} name="visible_till" label="Visible Till" disablePast />
            </div>

            {/* Visible To */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-semibold">Visible To</h3>
              </div>
              <FormField control={form.control} name="visibility_type" render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="targeted">Target Specific Users</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch('visibility_type') === 'targeted' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    All filters are optional. Within a category, ANY match qualifies.
                  </p>
                  <FormField control={form.control} name="target_gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <div className="flex flex-wrap gap-3 rounded-md border border-border p-3">
                        {TARGET_GENDERS.map((g) => (
                          <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={field.value?.includes(g.value)}
                              onCheckedChange={(c) => {
                                const cur = field.value ?? [];
                                field.onChange(c ? [...cur, g.value] : cur.filter((v) => v !== g.value));
                              }}
                            />
                            {g.label}
                          </label>
                        ))}
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="target_languages" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Languages</FormLabel>
                      <MultiSelectCombobox options={TARGET_LANGUAGES} value={field.value ?? []} onChange={field.onChange}
                        placeholder="Select languages…" searchPlaceholder="Search…" emptyText="No languages found" allowOther />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="target_skills" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skills</FormLabel>
                      <MultiSelectCombobox options={TARGET_SKILLS} value={field.value ?? []} onChange={field.onChange}
                        placeholder="Select skills…" searchPlaceholder="Search…" emptyText="No skills found" allowOther />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="target_status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Status</FormLabel>
                      <div className="flex flex-wrap gap-3 rounded-md border border-border p-3">
                        {TARGET_STATUS.map((g) => (
                          <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={field.value?.includes(g.value)}
                              onCheckedChange={(c) => {
                                const cur = field.value ?? [];
                                field.onChange(c ? [...cur, g.value] : cur.filter((v) => v !== g.value));
                              }}
                            />
                            {g.label}
                          </label>
                        ))}
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="target_profession" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Working Profession</FormLabel>
                      <MultiSelectCombobox options={TARGET_PROFESSIONS} value={field.value ?? []} onChange={field.onChange}
                        placeholder="Select professions…" searchPlaceholder="Search…" emptyText="No matches" />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Initial Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft — keep editing later</SelectItem>
                    <SelectItem value="active">Active — visible to contributors immediately</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </SectionCard>

          {/* ============ Section: Guidelines & Contributor Onboarding ============ */}
          <SectionCard
            id="onboarding"
            title="Guidelines & Contributor Onboarding"
            subtitle="Publish optional studio access, referral code, and project guide to /app/guidelines"
            icon={BookOpen}
            done={sectionDone.onboarding}
          >
            <FormField
              control={form.control}
              name="has_guidelines_hub"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold">Show in Guidelines Hub</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Enable to display a 5-tab project guide and platform access links at <code>/app/guidelines</code>.
                    </p>
                  </div>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {watched.has_guidelines_hub && (
              <div className="space-y-4 pt-2 border-t border-border animate-fade-in">
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project URL Slug <span className="text-xs text-muted-foreground font-normal">(e.g. "vla")</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. vla" {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Used for route detail page: <code>/app/guidelines/{field.value || 'slug'}</code></p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="short_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Description <span className="text-xs text-muted-foreground font-normal">(displayed on hub card)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Onboarding, quality calibration, and studio access for the VLA project." {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="platform_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Studio Platform URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://studio.client-platform.com" {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="referral_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referral / Pairing Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. DATAFORGE-VLA-2026" {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="discord_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discord Channel URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://discord.gg/..." {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="community_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Community Network URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://t.me/..." {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="guidelines_doc_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>External Spec PDF / Doc URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://docs.google.com/..." {...field} onBlur={() => { field.onBlur(); flushNow(); }} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}
          </SectionCard>

        </form>
      </Form>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs text-muted-foreground truncate">
            {saveStatus === 'saved' && lastSavedAt ? `All changes saved · ${formatDistanceToNow(lastSavedAt, { addSuffix: true })}` : saveLabel}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline"
              onClick={async () => { await flushNow(); toast.success('Draft saved'); }}
              disabled={saveStatus === 'saving'}>
              Save as Draft
            </Button>
            <Button type="button" variant="hero"
              disabled={publishMutation.isPending || !allDone}
              onClick={form.handleSubmit(onSubmit, onInvalid)}
              title={!allDone ? 'Complete all sections to publish' : undefined}>
              {publishMutation.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </div>
      </div>

      {/* Resume draft modal */}
      <AlertDialog open={resumeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume your draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unfinished project from earlier
              {resumeCandidate?.values && (resumeCandidate.values as any).title ? <> titled <strong>“{(resumeCandidate.values as any).title}”</strong></> : null}
              {resumeCandidate?.updatedAt ? <>, last edited {formatDistanceToNow(new Date(resumeCandidate.updatedAt), { addSuffix: true })}</> : null}.
              {' '}Continue where you left off or start fresh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Start Fresh</AlertDialogCancel>
            <AlertDialogAction onClick={acceptResume}>Continue Editing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Helpers ----------
function SectionCard({
  id, title, subtitle, icon: Icon, done, children,
}: {
  id: string; title: string; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean; children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-44 rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-start gap-3 border-b border-border/60 p-5">
        <div className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'
        )}>
          {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function DateField({ control, name, label, disablePast }: { control: any; name: string; label: string; disablePast?: boolean }) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem className="flex flex-col">
        <FormLabel>{label}</FormLabel>
        <Popover>
          <PopoverTrigger asChild>
            <FormControl>
              <Button variant="outline" className={cn('h-10 w-full justify-start rounded-md border-input bg-background px-3 text-sm font-normal', !field.value && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                {field.value ? format(field.value, 'PPP') : 'Select date'}
              </Button>
            </FormControl>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={field.value} onSelect={field.onChange}
              disabled={disablePast ? (d) => d < new Date() : undefined}
              initialFocus className={cn('p-3 pointer-events-auto')} />
          </PopoverContent>
        </Popover>
        <FormMessage />
      </FormItem>
    )} />
  );
}
