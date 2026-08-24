import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTask } from '@/services/projectService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, Plus, X, Upload, Loader2 as UploadSpinner, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Task, ExampleMediaItem } from '@/types/project';
import MultiSelectCombobox from '@/components/profile/MultiSelectCombobox';
import { ExampleMediaEditor } from '@/components/admin/ExampleMediaEditor';
import { CategoriesEditor, type ProjectCategory } from '@/components/admin/CategoriesEditor';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

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
  { value: 'Engineer', label: 'Engineer' },
  { value: 'Doctor', label: 'Doctor' },
  { value: 'Lawyer', label: 'Lawyer' },
  { value: 'Teacher', label: 'Teacher' },
  { value: 'Designer', label: 'Designer' },
  { value: 'Developer', label: 'Developer' },
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

const editSchema = z.object({
  title: z.string().trim().min(3).max(120),
  overview: z.string().trim().max(1000, 'Overview cannot exceed 1000 characters').optional(),
  instructions: z.string().refine((v) => stripHtml(v).length >= 10, { message: 'Description must be at least 10 characters' }),
  media_type: z.enum(['text', 'audio', 'image', 'video']),
  duration_label: z.string().trim().min(1, 'Duration is required').max(50),
  total_tasks: z.coerce.number().int().min(1).max(10000),
  visible_till: z.date().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']),
  pay_per_task: z.coerce.number().min(0),
  reward_tokens: z.coerce.number().int().min(0),
  payment_terms: z.enum(['on_completion', 'weekly', 'monthly']),
  start_date: z.date().optional(),
  end_date: z.date().optional(),
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
  if (data.visibility_type === 'targeted') {
    const total =
      data.target_gender.length + data.target_languages.length +
      data.target_skills.length + data.target_status.length + data.target_profession.length;
    if (total === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['visibility_type'], message: 'Select at least one filter or change to Everyone' });
    }
  }
});

type EditValues = z.infer<typeof editSchema>;

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTaskDialog({ task, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    mode: 'all',
    defaultValues: {
      title: '',
      overview: '',
      instructions: '',
      media_type: 'text',
      duration_label: '',
      total_tasks: 10,
      status: 'active',
      pay_per_task: 0,
      reward_tokens: 0,
      payment_terms: 'on_completion',
      visibility_type: 'everyone',
      target_gender: [],
      target_languages: [],
      target_skills: [],
      target_status: [],
      target_profession: [],
      has_guidelines_hub: false,
      slug: '', short_description: '', platform_url: '', referral_code: '',
      discord_url: '', community_url: '', guidelines_doc_url: '',
    },
  });

  const [dosItems, setDosItems] = useState<string[]>([]);
  const [dontsItems, setDontsItems] = useState<string[]>([]);
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');
  const [sampleMediaUrls, setSampleMediaUrls] = useState<string[]>([]);
  const [exampleMedia, setExampleMedia] = useState<ExampleMediaItem[]>([]);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [originalCategoryIds, setOriginalCategoryIds] = useState<string[]>([]);
  const isCategoryProject = task?.project_type === 'category';

  useEffect(() => {
    if (task && open) {
      const tf: any = task.target_filters ?? {};
      form.reset({
        title: task.title,
        overview: task.overview ?? '',
        instructions: task.instructions,
        media_type: task.media_type,
        duration_label: task.duration_label ?? (task.duration_minutes ? `${task.duration_minutes} mins` : ''),
        total_tasks: task.total_tasks,
        visible_till: task.visible_till ? new Date(task.visible_till) : undefined,
        status: (task.status as any) ?? 'active',
        pay_per_task: task.pay_per_task ?? 0,
        reward_tokens: task.reward_tokens ?? 0,
        payment_terms: (task.payment_terms as any) ?? 'on_completion',
        start_date: task.start_date ? new Date(task.start_date) : undefined,
        end_date: task.end_date ? new Date(task.end_date) : undefined,
        max_file_size_mb: task.max_file_size_mb ?? undefined,
        visibility_type: (task.visibility_type as any) ?? 'everyone',
        target_gender: Array.isArray(tf.gender) ? tf.gender : [],
        target_languages: Array.isArray(tf.languages) ? tf.languages : [],
        target_skills: Array.isArray(tf.skills) ? tf.skills : [],
        target_status: Array.isArray(tf.status) ? tf.status : [],
        target_profession: Array.isArray(tf.profession) ? tf.profession : [],
        has_guidelines_hub: task.has_guidelines_hub ?? false,
        slug: task.slug ?? '',
        short_description: task.short_description ?? '',
        platform_url: task.platform_url ?? '',
        referral_code: task.referral_code ?? '',
        discord_url: task.discord_url ?? '',
        community_url: task.community_url ?? '',
        guidelines_doc_url: task.guidelines_doc_url ?? '',
      });
      setDosItems(task.dos ?? []);
      setDontsItems(task.donts ?? []);
      setSampleMediaUrls(task.sample_media_urls ?? []);
      setExampleMedia(Array.isArray(task.example_media) ? task.example_media : []);
      setNewDo('');
      setNewDont('');
      setCategories([]);
      setOriginalCategoryIds([]);
      if (task.project_type === 'category') {
        supabase
          .from('project_categories')
          .select('id, category_name, welcome_message, category_overview, sort_order')
          .eq('project_id', task.id)
          .order('sort_order', { ascending: true })
          .then(({ data, error }) => {
            if (error) {
              console.error('[EditTaskDialog] failed to load categories', error);
              return;
            }
            const rows = (data ?? []) as any[];
            setCategories(rows.map((r) => ({
              id: r.id,
              category_name: r.category_name ?? '',
              welcome_message: r.welcome_message ?? '',
              category_overview: r.category_overview ?? '',
            })));
            setOriginalCategoryIds(rows.map((r) => r.id));
          });
      }
    }
  }, [task, open]);

  const addDo = () => { if (newDo.trim()) { setDosItems(p => [...p, newDo.trim()]); setNewDo(''); } };
  const addDont = () => { if (newDont.trim()) { setDontsItems(p => [...p, newDont.trim()]); setNewDont(''); } };

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

  const getMediaType = (url: string): 'image' | 'audio' | 'video' | 'unknown' => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
    if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'video';
    return 'unknown';
  };

  const mutation = useMutation({
    mutationFn: async (values: EditValues) => {
      const requestedSlots = Number(values.total_tasks);
      if (!Number.isFinite(requestedSlots) || requestedSlots < 1) {
        throw new Error('Slots must be at least 1');
      }
      const slots = Math.max(requestedSlots, task!.filled_tasks);
      if (slots !== requestedSlots) {
        toast.warning(`Slots cannot be less than approved submissions (${task!.filled_tasks}). Using ${slots}.`);
      }
      const match = values.duration_label.match(/\d+/);
      const durationMin = match ? parseInt(match[0], 10) : null;

      const targetFilters: Record<string, string[]> = {};
      if (values.visibility_type === 'targeted') {
        if (values.target_gender.length) targetFilters.gender = values.target_gender;
        if (values.target_languages.length) targetFilters.languages = values.target_languages;
        if (values.target_skills.length) targetFilters.skills = values.target_skills;
        if (values.target_status.length) targetFilters.status = values.target_status;
        if (values.target_profession.length) targetFilters.profession = values.target_profession;
      }

      await updateTask(task!.id, {
        title: values.title,
        overview: values.overview?.trim() || null,
        instructions: values.instructions,
        media_type: values.media_type,
        duration_minutes: durationMin,
        duration_label: values.duration_label,
        total_tasks: slots,
        visible_till: values.visible_till ? values.visible_till.toISOString() : null,
        status: values.status,
        pay_per_task: values.pay_per_task,
        reward_tokens: values.reward_tokens,
        payment_terms: values.payment_terms,
        start_date: values.start_date ? values.start_date.toISOString() : null,
        end_date: values.end_date ? values.end_date.toISOString() : null,
        dos: dosItems,
        donts: dontsItems,
        sample_media_urls: exampleMedia.length > 0 ? exampleMedia.map((e) => e.url) : sampleMediaUrls,
        example_media: exampleMedia,
        max_file_size_mb: values.max_file_size_mb ? Number(values.max_file_size_mb) : null,
        visibility_type: values.visibility_type,
        target_filters: targetFilters,
        has_guidelines_hub: values.has_guidelines_hub ?? false,
        slug: values.slug?.trim() || null,
        short_description: values.short_description?.trim() || null,
        platform_url: values.platform_url?.trim() || null,
        referral_code: values.referral_code?.trim() || null,
        discord_url: values.discord_url?.trim() || null,
        community_url: values.community_url?.trim() || null,
        guidelines_doc_url: values.guidelines_doc_url?.trim() || null,
      } as any);

      if (isCategoryProject) {
        // Sync categories: update existing, insert new, delete removed
        const keptIds = categories.filter((c) => c.id).map((c) => c.id as string);
        const toDelete = originalCategoryIds.filter((id) => !keptIds.includes(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase
            .from('project_categories')
            .delete()
            .in('id', toDelete);
          if (delErr) throw delErr;
        }
        for (let i = 0; i < categories.length; i++) {
          const c = categories[i];
          const payload = {
            project_id: task!.id,
            category_name: c.category_name,
            welcome_message: c.welcome_message || null,
            category_overview: c.category_overview || null,
            sort_order: i,
          };
          if (c.id) {
            const { error } = await supabase
              .from('project_categories')
              .update(payload)
              .eq('id', c.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('project_categories')
              .insert(payload);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
      await queryClient.refetchQueries({ queryKey: ['admin-tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['project-categories', task?.id] });
      toast.success('Project updated');
      onOpenChange(false);
    },
    onError: (err: any) => {
      console.error('[EditTaskDialog] update failed', err);
      toast.error(err?.message || 'Failed to update project');
    },
  });

  const onSubmit = (values: EditValues) => mutation.mutate(values);

  if (!task) return null;
  const mediaType = form.watch('media_type');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Edit Project</DialogTitle>
          <DialogDescription>Update all project details.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="overview" render={({ field }) => (
              <FormItem>
                <FormLabel>Overview <span className="text-xs text-muted-foreground font-normal">(short summary)</span></FormLabel>
                <FormControl>
                  <textarea
                    className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="A 2-3 line summary…"
                    maxLength={1000}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="instructions" render={({ field }) => (
              <FormItem>
                <FormLabel>Full Description</FormLabel>
                <FormControl>
                  <RichTextEditor value={field.value} onChange={field.onChange} placeholder="Instructions…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Media Type + Duration */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="media_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Media Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  <FormControl><Input type="text" placeholder='e.g. "2-6 mins"' {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Total Tasks + Visible Till */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="total_tasks" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Tasks</FormLabel>
                  <FormControl>
                    <Input type="number" min={task.filled_tasks} max={10000} {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Min: {task.filled_tasks}</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="visible_till" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Visible Till</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn('h-10 w-full justify-start text-sm font-normal', !field.value && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                          {field.value ? format(field.value, 'PPP') : 'Optional'}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Task Categories (only for category projects) */}
            {isCategoryProject && (
              <div className="space-y-3">
                <Separator />
                <div>
                  <h2 className="font-display text-base font-semibold">Task Categories</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activity categories within this project. Each has its own welcome message and overview.
                  </p>
                </div>
                <CategoriesEditor categories={categories} onChange={setCategories} />
              </div>
            )}

            {/* Do's and Don'ts */}
            <div className="space-y-4">
              <Separator />
              <h2 className="font-display text-base font-semibold">Do's & Don'ts</h2>
              <div className="space-y-2">
                <FormLabel>Do's</FormLabel>
                <div className="flex gap-2">
                  <Input value={newDo} onChange={(e) => setNewDo(e.target.value)} placeholder="Add a do item…" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDo())} />
                  <Button type="button" size="icon" variant="outline" onClick={addDo}><Plus className="h-4 w-4" /></Button>
                </div>
                {dosItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="text-success">✓</span>
                    <span className="flex-1">{item}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDosItems(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <FormLabel>Don'ts</FormLabel>
                <div className="flex gap-2">
                  <Input value={newDont} onChange={(e) => setNewDont(e.target.value)} placeholder="Add a don't item…" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDont())} />
                  <Button type="button" size="icon" variant="outline" onClick={addDont}><Plus className="h-4 w-4" /></Button>
                </div>
                {dontsItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="text-destructive">✗</span>
                    <span className="flex-1">{item}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDontsItems(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Example Media */}
            <div className="space-y-3">
              <Separator />
              <div>
                <h2 className="font-display text-base font-semibold">Example Media</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Good and bad reference cards (shared across all categories). Up to 1 GB per file or paste a Drive/Dropbox/OneDrive link.
                </p>
              </div>
              <ExampleMediaEditor items={exampleMedia} onChange={setExampleMedia} />

              {sampleMediaUrls.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Legacy sample files</p>
                  <div className="space-y-2">
                    {sampleMediaUrls.map((url, i) => {
                      const type = getMediaType(url);
                      return (
                        <div key={i} className="rounded-md border border-border p-2 space-y-1">
                          {type === 'image' && <img src={url} alt={`Sample ${i + 1}`} className="w-full max-h-32 object-contain rounded bg-muted" />}
                          {type === 'audio' && <audio controls className="w-full"><source src={url} /></audio>}
                          {type === 'video' && <video controls className="w-full max-h-32"><source src={url} /></video>}
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate text-xs text-muted-foreground">{url.split('/').pop()}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSampleMediaUrls(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Financial Details */}
            <div className="space-y-4">
              <Separator />
              <h2 className="font-display text-base font-semibold">Financial Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="pay_per_task" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay Per Hour (₹)</FormLabel>
                    <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reward_tokens" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Tokens</FormLabel>
                    <FormControl><Input type="number" min={0} step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="payment_terms" render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Terms</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="start_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !field.value && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : 'Optional'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="end_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !field.value && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'PPP') : 'Optional'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Submission Settings */}
            {mediaType !== 'text' && (
              <div className="space-y-4">
                <Separator />
                <h2 className="font-display text-base font-semibold">Submission Settings</h2>
                <FormField control={form.control} name="max_file_size_mb" render={({ field }) => {
                  const mt = mediaType as 'image' | 'video' | 'audio';
                  const defaultMb = mt === 'image' ? 10 : mt === 'video' ? 100 : 50;
                  return (
                    <FormItem>
                      <FormLabel>Max File Size (MB) <span className="text-xs text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={2048}
                          placeholder={`Default: ${defaultMb} MB`}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Leave empty to use the default for {mt} ({defaultMb} MB).</p>
                      <FormMessage />
                    </FormItem>
                  );
                }} />
              </div>
            )}

            {/* Status */}
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Visible To */}
            <div className="space-y-4">
              <Separator />
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base font-semibold">Visible To</h2>
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
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    All filters are optional. Within a category, ANY match qualifies; across categories, ALL set categories must match.
                  </p>

                  <FormField control={form.control} name="target_gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <div className="flex flex-wrap gap-3 rounded-md border border-border p-3">
                        {TARGET_GENDERS.map((g) => (
                          <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={field.value?.includes(g.value)}
                              onCheckedChange={(checked) => {
                                const cur = field.value ?? [];
                                field.onChange(checked ? [...cur, g.value] : cur.filter((v) => v !== g.value));
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
                      <MultiSelectCombobox
                        options={TARGET_LANGUAGES}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        placeholder="Select languages…"
                        searchPlaceholder="Search languages…"
                        emptyText="No languages found"
                        allowOther
                      />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="target_skills" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skills</FormLabel>
                      <MultiSelectCombobox
                        options={TARGET_SKILLS}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        placeholder="Select skills…"
                        searchPlaceholder="Search skills…"
                        emptyText="No skills found"
                        allowOther
                      />
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
                              onCheckedChange={(checked) => {
                                const cur = field.value ?? [];
                                field.onChange(checked ? [...cur, g.value] : cur.filter((v) => v !== g.value));
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
                      <MultiSelectCombobox
                        options={TARGET_PROFESSIONS}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        placeholder="Select professions…"
                        searchPlaceholder="Search…"
                        emptyText="No matches"
                      />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            <Separator />

            {/* ============ Guidelines & Contributor Onboarding ============ */}
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
              <h3 className="font-semibold text-sm">Guidelines & Contributor Onboarding</h3>
              <FormField
                control={form.control}
                name="has_guidelines_hub"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">Show in Guidelines Hub</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Display this project guide and platform links at <code>/app/guidelines</code>.
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

              {form.watch('has_guidelines_hub') && (
                <div className="space-y-4 pt-2 animate-fade-in">
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project URL Slug <span className="text-xs text-muted-foreground font-normal">(e.g. "vla")</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. vla" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="short_description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short Description <span className="text-xs text-muted-foreground font-normal">(card subtitle)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Onboarding, quality calibration, and studio access." {...field} />
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
                            <Input placeholder="https://studio.client-platform.com" {...field} />
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
                            <Input placeholder="e.g. DATAFORGE-VLA-2026" {...field} />
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
                            <Input placeholder="https://discord.gg/..." {...field} />
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
                            <Input placeholder="https://t.me/..." {...field} />
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
                            <Input placeholder="https://docs.google.com/..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" variant="hero" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
