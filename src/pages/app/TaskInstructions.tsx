import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Task } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Layers, Check, ChevronsUpDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, CheckCircle2, XCircle, FileText, Play, Calendar, Wallet, Sparkles, ZoomIn, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';
import { fetchProjectSubmissionsCount } from '@/services/projectService';
import DOMPurify from 'dompurify';

interface ProjectCategoryRow {
  id: string;
  category_name: string;
  welcome_message: string | null;
  category_overview: string | null;
}

export default function TaskInstructions() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submissionsCount, setSubmissionsCount] = useState<number>(0);
  const [categories, setCategories] = useState<ProjectCategoryRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', taskId)
        .single();
      if (error || !data) {
        toast.error('Project not found');
        navigate('/app', { replace: true });
        return;
      }
      setTask(data as unknown as Task);
      setLoading(false);
      try {
        const c = await fetchProjectSubmissionsCount(taskId);
        setSubmissionsCount(c);
      } catch { /* non-blocking */ }
      // Fetch categories only for category-type projects
      if ((data as any).project_type === 'category') {
        const { data: cats } = await supabase
          .from('project_categories')
          .select('id, category_name, welcome_message, category_overview')
          .eq('project_id', taskId)
          .order('sort_order', { ascending: true });
        setCategories((cats ?? []) as ProjectCategoryRow[]);
      }
    })();
  }, [taskId, navigate]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!task) return null;

  const hasDos = task.dos && task.dos.length > 0;
  const hasDonts = task.donts && task.donts.length > 0;
  const exampleMedia = Array.isArray(task.example_media) ? task.example_media : [];
  const goodExamples = exampleMedia.filter((e) => e.kind === 'good');
  const badExamples = exampleMedia.filter((e) => e.kind === 'bad');
  const hasExamples = exampleMedia.length > 0;
  const hasSamples = task.sample_media_urls && task.sample_media_urls.length > 0;
  const needsAck = hasDos || hasDonts;
  const isCategoryProject = task.project_type === 'category';
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || null;
  const needsCategory = isCategoryProject && categories.length > 0;
  const canStart = (!needsAck || acknowledged) && (!needsCategory || !!selectedCategoryId);

  const getMediaType = (url: string): 'image' | 'audio' | 'video' | 'unknown' => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
    if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'video';
    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) return 'image';
    if (url.match(/\.(mp3|wav|m4a|ogg)/i)) return 'audio';
    if (url.match(/\.(mp4|mov|webm)/i)) return 'video';
    return 'unknown';
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/app/task/${taskId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold">Instructions</h1>
          <p className="text-sm text-muted-foreground">{task.title}</p>
        </div>
      </div>

      {/* Meta: earnings + tokens (row 1), date range (row 2), submissions progress (row 3) */}
      <Card className="shadow-card">
        <CardContent className="p-4 space-y-3">
          {(task.pay_per_task > 0 || task.reward_tokens > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              {task.pay_per_task > 0 && (
                <span className="font-semibold text-primary inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" />
                  ₹{formatMoney(task.pay_per_task)} per hour
                </span>
              )}
              {task.reward_tokens > 0 && (
                <span className="font-semibold text-primary inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  +{task.reward_tokens} tokens
                </span>
              )}
            </div>
          )}
          {(task.start_date && task.end_date) && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{format(new Date(task.start_date), 'MMM d, yyyy')} – {format(new Date(task.end_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{submissionsCount.toLocaleString()} submissions • {task.total_tasks.toLocaleString()} total tasks</span>
              <span>{task.total_tasks > 0 ? Math.min(100, Math.round((submissionsCount / task.total_tasks) * 100)) : 0}%</span>
            </div>
            <Progress value={task.total_tasks > 0 ? Math.min(100, (submissionsCount / task.total_tasks) * 100) : 0} className="h-1.5" />
          </div>
        </CardContent>
      </Card>

      {/* Category selector — category-type projects only */}
      {isCategoryProject && (
        <Card className="shadow-card border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-base font-semibold">Select Activity Category</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose what activity you'll perform — instructions, payout and rules stay the same.
                </p>
              </div>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No categories configured yet. Please check back later.
              </p>
            ) : (
              <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryPickerOpen}
                    className={cn(
                      'w-full justify-between font-normal transition-colors',
                      !selectedCategory && 'text-muted-foreground'
                    )}
                  >
                    {selectedCategory ? selectedCategory.category_name : 'Choose your activity category'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search categories…" />
                    <CommandList>
                      <CommandEmpty>No matching category.</CommandEmpty>
                      <CommandGroup>
                        {categories.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.category_name}
                            onSelect={() => {
                              setSelectedCategoryId(c.id);
                              setCategoryPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedCategoryId === c.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {c.category_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            {selectedCategory && (
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-4 sm:p-5 space-y-3 animate-slide-up shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-primary/70">Selected activity</p>
                    <h3 className="font-display text-base sm:text-lg font-semibold text-foreground leading-tight mt-0.5 break-words">
                      {selectedCategory.category_name}
                    </h3>
                  </div>
                </div>
                {selectedCategory.welcome_message && (
                  <div className="rounded-lg bg-background/60 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-primary/70 mb-1">Welcome</p>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {selectedCategory.welcome_message}
                    </p>
                  </div>
                )}
                {selectedCategory.category_overview && (
                  <div className="rounded-lg bg-background/60 border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-primary/70 mb-1">Overview</p>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {selectedCategory.category_overview}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Example Media (Good / Bad) — shown right after category selection on category projects */}
      {hasExamples && isCategoryProject && (
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold">Examples</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reference good and bad submissions before you start.
              </p>
            </div>
            {goodExamples.length > 0 && (
              <ExampleGroup kind="good" items={goodExamples} />
            )}
            {badExamples.length > 0 && (
              <ExampleGroup kind="bad" items={badExamples} />
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-display text-base font-semibold">Task Instructions</h2>
          </div>
          <div
            className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none ProseMirror"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(task.instructions, {
                USE_PROFILES: { html: true },
                ADD_TAGS: ['audio', 'video', 'source', 'iframe'],
                ADD_ATTR: ['controls', 'src', 'type', 'allow', 'allowfullscreen', 'frameborder', 'target'],
              }),
            }}
          />
        </CardContent>
      </Card>

      {/* Example Media (Good / Bad) — non-category projects */}
      {hasExamples && !isCategoryProject && (
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold">Examples</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reference good and bad submissions before you start.
              </p>
            </div>
            {goodExamples.length > 0 && (
              <ExampleGroup kind="good" items={goodExamples} />
            )}
            {badExamples.length > 0 && (
              <ExampleGroup kind="bad" items={badExamples} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Legacy Sample Media (only when no structured examples) */}
      {!hasExamples && hasSamples && (
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Sample Media</h2>
            <div className="space-y-3">
              {task.sample_media_urls.map((url, i) => {
                const type = getMediaType(url);
                return (
                  <div key={i} className="rounded-lg border border-border overflow-hidden">
                    {type === 'image' && (
                      <img src={url} alt={`Sample ${i + 1}`} className="w-full max-h-64 object-contain bg-muted" />
                    )}
                    {type === 'audio' && (
                      <audio controls className="w-full p-3">
                        <source src={url} />
                      </audio>
                    )}
                    {type === 'video' && (
                      <video controls className="w-full max-h-64">
                        <source src={url} />
                      </video>
                    )}
                    {type === 'unknown' && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="block p-3 text-sm text-primary underline">
                        View sample file {i + 1}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Do's and Don'ts */}
      {(hasDos || hasDonts) && (
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-display text-base font-semibold">Do's & Don'ts</h2>
            {hasDos && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Do's</p>
                {task.dos.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
            {hasDonts && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Don'ts</p>
                {task.donts.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Acknowledgment + Start */}
      <div className="space-y-4 pb-4">
        {needsAck && (
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-4">
            <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} />
            <span className="text-sm font-medium">I have read and understood the instructions</span>
          </label>
        )}
        {needsCategory && !selectedCategoryId && (
          <p className="text-xs text-center text-muted-foreground">
            Select an activity category above to continue.
          </p>
        )}
        <Button
          variant="hero"
          className="w-full"
          disabled={!canStart}
          onClick={() => navigate(`/app/task/${taskId}/submit`, {
            state: selectedCategory
              ? { selectedCategoryId: selectedCategory.id, selectedCategoryName: selectedCategory.category_name }
              : undefined,
          })}
        >
          <Play className="h-4 w-4 mr-2" /> Start Submission
        </Button>
      </div>
    </div>
  );
}

function ExampleGroup({ kind, items }: { kind: 'good' | 'bad'; items: NonNullable<Task['example_media']> }) {
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    title?: string;
    note?: string;
  } | null>(null);

  const isGood = kind === 'good';
  const Icon = isGood ? CheckCircle2 : XCircle;
  const headerCls = isGood
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400';
  const cardBorder = isGood ? 'border-emerald-500/40' : 'border-rose-500/40';
  const badgeCls = isGood ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white';
  const label = isGood ? 'Good Example' : 'Bad Example';

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-sm font-semibold ${headerCls}`}>
        <Icon className="h-4 w-4" />
        <span>{label}s</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((ex) => (
          <div key={ex.id} className={`rounded-lg border-2 ${cardBorder} bg-card overflow-hidden flex flex-col`}>
            <div
              className={`relative w-full aspect-video bg-muted group ${
                ex.media_type === 'image' && ex.source === 'upload' ? 'cursor-pointer overflow-hidden' : ''
              }`}
              onClick={() => {
                if (ex.media_type === 'image' && ex.source === 'upload') {
                  setPreviewItem({ url: ex.url, title: ex.title, note: ex.note });
                }
              }}
            >
              {ex.media_type === 'image' && ex.source === 'upload' && (
                <>
                  <img
                    src={ex.url}
                    alt={ex.title || label}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-medium text-xs">
                    <ZoomIn className="h-5 w-5" />
                    <span>Click to view full image</span>
                  </div>
                </>
              )}
              {ex.media_type === 'video' && ex.source === 'upload' && (
                <video src={ex.url} className="w-full h-full object-contain bg-black" controls preload="metadata" />
              )}
              {ex.media_type === 'audio' && ex.source === 'upload' && (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                  <audio src={ex.url} controls className="w-full" />
                </div>
              )}
              {(ex.source === 'link' || ex.media_type === 'link') && (
                <a
                  href={ex.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-muted to-muted/50 hover:opacity-90 transition"
                >
                  <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center shadow">
                    <Play className="h-5 w-5 ml-0.5" />
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[80%] px-2">
                    {(() => { try { return new URL(ex.url).hostname; } catch { return 'External link'; } })()}
                  </span>
                </a>
              )}
              <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm ${badgeCls}`}>
                <Icon className="h-3 w-3" />
                {label.toUpperCase()}
              </span>
            </div>
            <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
              <div>
                {ex.title && (
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{ex.title}</p>
                )}
                {ex.note && (
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    <span className="font-medium text-foreground/80">Reason: </span>
                    {ex.note}
                  </p>
                )}
              </div>
              {ex.media_type === 'image' && ex.source === 'upload' && (
                <div className="pt-2 flex items-center gap-3 text-xs text-primary font-semibold">
                  <button
                    type="button"
                    onClick={() => setPreviewItem({ url: ex.url, title: ex.title, note: ex.note })}
                    className="hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ZoomIn className="h-3.5 w-3.5" /> View Photo
                  </button>
                  <a
                    href={ex.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Link
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Image Lightbox Modal */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-4 sm:p-6 bg-card text-card-foreground rounded-2xl">
          {previewItem && (
            <div className="space-y-4">
              <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md ${badgeCls}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {label.toUpperCase()}
                  </span>
                  <DialogTitle className="text-base font-bold truncate max-w-xs sm:max-w-md">
                    {previewItem.title || label}
                  </DialogTitle>
                </div>
              </DialogHeader>

              {/* High Res Full Image View */}
              <div className="relative w-full max-h-[65vh] bg-black/5 dark:bg-black/40 rounded-xl overflow-hidden flex items-center justify-center p-2 border border-border">
                <img
                  src={previewItem.url}
                  alt={previewItem.title || label}
                  className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-md"
                />
              </div>

              {previewItem.note && (
                <div className="p-3 bg-muted/50 rounded-xl border border-border/60">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Reason: </span>
                    {previewItem.note}
                  </p>
                </div>
              )}

              {/* Action Buttons: Open Image in New Tab & Download */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                <a
                  href={previewItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted transition text-foreground"
                >
                  <ExternalLink className="h-4 w-4 text-primary" />
                  Open Full Image in New Tab
                </a>
                <a
                  href={previewItem.url}
                  download="example-photo"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition shadow-xs"
                >
                  <Download className="h-4 w-4" />
                  Download Image
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
