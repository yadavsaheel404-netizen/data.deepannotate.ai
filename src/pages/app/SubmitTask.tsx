import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { createSubmission, fetchUserSubmissionCount } from '@/services/taskService';
import { isTaskAcceptingSubmissions } from '@/lib/taskStatus';
import type { Task } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Type, Mic, Camera, Video, Upload,
  CheckCircle2, X, Loader2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getMaxFileSizeMB, formatFileSize, ACCEPTED_FORMATS, ACCEPT_ATTRIBUTE, validateFileType } from '@/lib/fileSizeLimits';
import { Input } from '@/components/ui/input';
import { Link as LinkIcon } from 'lucide-react';

const ALLOWED_LINK_HOSTS = [
  'drive.google.com', 'docs.google.com',
  'dropbox.com', 'www.dropbox.com',
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'onedrive.live.com', '1drv.ms',
  'we.tl', 'wetransfer.com',
  'vimeo.com',
];

function validateExternalUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Please paste a link' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL. Include https:// at the start.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) links are allowed' };
  }
  const host = parsed.hostname.toLowerCase();
  const ok = ALLOWED_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) {
    return { ok: false, error: 'Use a Google Drive, Dropbox, OneDrive, WeTransfer, YouTube, or Vimeo link' };
  }
  return { ok: true, url: parsed.toString() };
}

const sanitizeFileName = (name: string): string => {
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  const cleanBase = base.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  return `${cleanBase}${cleanExt}`;
};

const MEDIA_CONFIG: Record<string, { icon: React.ElementType; label: string; hint: string }> = {
  text: { icon: Type, label: 'Text', hint: 'Type your response in the text box below.' },
  audio: { icon: Mic, label: 'Audio', hint: 'Upload an audio recording (MP3, WAV, M4A).' },
  image: { icon: Camera, label: 'Image', hint: 'Upload a photo or image (JPG, PNG, WebP).' },
  video: { icon: Video, label: 'Video', hint: 'Upload a video file (MP4, MOV, WebM).' },
};

export default function SubmitTask() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navState = (location.state ?? {}) as {
    selectedCategoryId?: string;
    selectedCategoryName?: string;
  };
  const selectedCategoryId = navState.selectedCategoryId ?? null;
  const selectedCategoryName = navState.selectedCategoryName ?? null;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [myCount, setMyCount] = useState(0);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Submission mode for audio/video tasks
  const [submitMode, setSubmitMode] = useState<'file' | 'link'>('file');
  const [externalUrl, setExternalUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Unified preview URL — created for any image/video/audio file, revoked on change/unmount
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const type = selectedFile.type;
    const isPreviewable =
      type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
    if (!isPreviewable) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  const isInitialized = useAuthStore((s) => s.isInitialized);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId || !isInitialized) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let isSubscribed = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [taskRes, count] = await Promise.all([
          supabase.from('projects').select('*').eq('id', taskId).single(),
          fetchUserSubmissionCount(user.id, taskId),
        ]);
        if (!isSubscribed) return;
        if (taskRes.error || !taskRes.data) {
          toast.error('Project not found');
          navigate('/app', { replace: true });
          return;
        }
        setTask(taskRes.data as unknown as Task);
        setMyCount(count);
      } catch (err: any) {
        console.error('Failed to load project details:', err);
        if (isSubscribed) {
          setLoadError(err?.message || 'Failed to load project submission details');
          toast.error('Failed to load project details');
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [taskId, navigate, user?.id, isInitialized]);

  if (!isInitialized || loading) {
    return (
      <div className="space-y-4 p-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4 mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Authentication Required</h2>
        <p className="text-sm text-slate-500">Please sign in to view and submit tasks.</p>
        <Button onClick={() => navigate('/auth/login', { state: { from: location.pathname } })} className="bg-[#0E1F3E] text-white font-bold">
          Sign In
        </Button>
      </div>
    );
  }

  if (loadError || !task) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4 mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Unable to Load Task</h2>
        <p className="text-sm text-slate-500">{loadError || 'Project not found'}</p>
        <Button onClick={() => navigate('/app')} variant="outline" className="font-semibold">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const config = MEDIA_CONFIG[task.media_type];
  const isText = task.media_type === 'text';
  const allowsLink = task.media_type === 'video' || task.media_type === 'audio';
  const isLinkMode = allowsLink && submitMode === 'link';
  const MediaIcon = config.icon;
  const limitReached = myCount >= task.total_tasks;
  const isCategoryProject = task.project_type === 'category';
  const categoryMissing = isCategoryProject && !selectedCategoryId;
  const canSubmit = !limitReached && !categoryMissing && (
    isText
      ? textContent.trim().length > 0
      : isLinkMode
        ? externalUrl.trim().length > 0 && !linkError
        : (!!selectedFile && !uploadError)
  );
  const accepting = isTaskAcceptingSubmissions(task);
  const tasksRemaining = task.total_tasks - Math.min(task.filled_tasks, task.total_tasks);

  const maxSizeMb = getMaxFileSizeMB(task.media_type, task.max_file_size_mb);
  const acceptedFormats = !isText ? ACCEPTED_FORMATS[task.media_type as 'image' | 'video' | 'audio'] : '';
  const sizeHelperText = !isText ? `Max file size: ${maxSizeMb}MB (${acceptedFormats})` : '';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict MIME + extension validation
    const validation = validateFileType(file, task.media_type as 'image' | 'video' | 'audio');
    if (validation.ok === false) {
      setUploadError(validation.error);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.error(validation.error);
      return;
    }

    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const label = task.media_type.charAt(0).toUpperCase() + task.media_type.slice(1);
      setUploadError(`${label} must be under ${maxSizeMb}MB`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadError(null);
    setSelectedFile(file);
  };

  const computeSha256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleSubmit = async () => {
    if (!user || !task) return;
    const profile = useAuthStore.getState().profile as any;
    if (profile && profile.is_active === false) {
      const msg = 'Your account is inactive. Contact support.';
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    if (isCategoryProject && !selectedCategoryId) {
      const msg = 'Please go back and select an activity category before submitting.';
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    if (!accepting) {
      setUploadError('This project is no longer accepting tasks');
      return;
    }
    // Frontend re-check against server count to enforce limit strictly
    const freshCount = await fetchUserSubmissionCount(user.id, task.id).catch(() => myCount);
    setMyCount(freshCount);
    if (freshCount >= task.total_tasks) {
      setUploadError(`Submission limit reached (${freshCount}/${task.total_tasks}). This task is now closed.`);
      return;
    }
    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(10);
    try {
      let fileUrl: string | null = null;
      let fileHash: string | null = null;
      let validatedExternalUrl: string | null = null;
      let submissionType: 'file' | 'link' | 'text' = isText ? 'text' : 'file';

      if (isLinkMode) {
        const v = validateExternalUrl(externalUrl);
        if (v.ok === false) {
          setLinkError(v.error);
          throw new Error(v.error);
        }
        validatedExternalUrl = v.url;
        submissionType = 'link';
        setUploadProgress(60);
      } else if (selectedFile) {
        // Compute hash client-side BEFORE upload
        try {
          fileHash = await computeSha256(selectedFile);
        } catch (hashErr) {
          console.error('Hash generation failed:', hashErr);
          throw new Error('Could not verify file content. Please try again.');
        }
        setUploadProgress(20);

        // Pre-check: same user + project + hash already exists?
        const { data: existing, error: dupErr } = await supabase
          .from('tasks')
          .select('id')
          .eq('user_id', user.id)
          .eq('project_id', task.id)
          .eq('file_hash', fileHash)
          .limit(1);
        if (dupErr) console.warn('Dup pre-check failed:', dupErr);
        if (existing && existing.length > 0) {
          throw new Error('DUPLICATE');
        }

        setUploadProgress(35);

        // Server-side validation + signed upload URL (direct uploads are blocked)
        const { data: validateRes, error: validateErr } = await supabase.functions.invoke(
          'validate-upload',
          {
            body: {
              project_id: task.id,
              file_name: selectedFile.name,
              file_size: selectedFile.size,
              mime_type: selectedFile.type,
            },
          },
        );
        if (validateErr || !validateRes?.path || !validateRes?.token) {
          const msg =
            (validateRes && (validateRes as any).error) ||
            validateErr?.message ||
            'File validation failed';
          throw new Error(msg);
        }

        const { path: signedPath, token: uploadToken } = validateRes as {
          path: string;
          token: string;
        };

        const { error: uploadErr } = await supabase.storage
          .from('submissions')
          .uploadToSignedUrl(signedPath, uploadToken, selectedFile, {
            contentType: selectedFile.type,
            upsert: false,
          });
        if (uploadErr) {
          console.error('Storage upload failed:', uploadErr);
          throw new Error(uploadErr.message || 'File upload to storage failed');
        }
        fileUrl = signedPath;
        submissionType = 'file';
        setUploadProgress(70);
      }
      await createSubmission({
        project_id: task.id,
        user_id: user.id,
        file_url: fileUrl,
        file_hash: fileHash,
        text_content: isText ? textContent.trim() : null,
        external_url: validatedExternalUrl,
        submission_type: submissionType,
        selected_category_id: isCategoryProject ? selectedCategoryId : null,
      });
      setUploadProgress(100);
      setMyCount((c) => c + 1);
      setDone(true);
      toast.success('Submission uploaded successfully');
    } catch (err: any) {
      console.error('Submission failed:', err);
      const msg = String(err?.message || err?.code || '');
      const isLimit = msg.includes('SUBMISSION_LIMIT_REACHED');
      const isDuplicate =
        msg === 'DUPLICATE' ||
        err?.code === '23505' ||
        msg.includes('duplicate key') ||
        msg.includes('tasks_user_project_file_hash_unique') ||
        msg.includes('tasks_user_project_file_url_unique');
      const friendly = isLimit
        ? `Submission limit reached (${task.total_tasks}/${task.total_tasks}). This task is now closed.`
        : isDuplicate
        ? 'Duplicate submission detected. Please upload unique content.'
        : 'Something went wrong. Please try again.';
      setUploadError(friendly);
      toast.error(friendly);
      if (isLimit) setMyCount(task.total_tasks);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setDone(false);
    setTextContent('');
    setSelectedFile(null);
    setExternalUrl('');
    setLinkError(null);
    setUploadProgress(0);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center max-w-md mx-auto animate-slide-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-xl font-bold">Submitted!</h2>
        <p className="text-sm text-muted-foreground">
          Your contribution has been sent for quality review. ({myCount}/{task.total_tasks} submissions done)
        </p>
        <div className="flex gap-3">
          {accepting && myCount < task.total_tasks && (
            <Button variant="outline" onClick={handleSubmitAnother}>Submit Another</Button>
          )}
          <Button variant="hero" onClick={() => navigate('/app', { replace: true })}>Back to Projects</Button>
        </div>
      </div>
    );
  }

  if (!accepting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center max-w-md mx-auto animate-slide-up">
        <X className="h-12 w-12 text-muted-foreground" />
        <h2 className="font-display text-xl font-bold">Project Closed</h2>
        <p className="text-sm text-muted-foreground">This project is no longer accepting tasks.</p>
        <Button variant="hero" onClick={() => navigate('/app', { replace: true })}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/app/task/${taskId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold">Submit: {task.title}</h1>
          <p className="text-sm text-muted-foreground">{config.hint}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your submissions: {myCount}/{task.total_tasks} · {tasksRemaining} tasks remaining
          </p>
        </div>
      </div>

      {isCategoryProject && selectedCategoryName && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <span className="text-muted-foreground">Activity category</span>
          <span className="font-semibold text-foreground truncate ml-2">{selectedCategoryName}</span>
        </div>
      )}

      {isCategoryProject && !selectedCategoryId && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium text-foreground">Category required</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Go back to instructions and select an activity category before uploading.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/task/${taskId}`)}>
            Go back
          </Button>
        </div>
      )}

      {limitReached && !uploadError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Submission limit reached ({myCount}/{task.total_tasks}). This task is now closed.</span>
        </div>
      )}

      {uploadError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Capture Area */}
      <Card className="shadow-card">
        <CardContent className="p-5 space-y-4">
          {isText ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Your Response</label>
              <Textarea
                placeholder="Type your contribution here…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                className="resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground text-right">{textContent.length}/5000</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allowsLink && (
                <>
                  <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => { setSubmitMode('file'); setLinkError(null); }}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors ${submitMode === 'file' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
                    >
                      <Upload className="inline h-3.5 w-3.5 mr-1" /> Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSubmitMode('link'); setUploadError(null); }}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors ${submitMode === 'link' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
                    >
                      <LinkIcon className="inline h-3.5 w-3.5 mr-1" /> Paste Link
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tip: For files larger than {maxSizeMb}MB, upload to Drive/Dropbox and paste the link.
                  </p>
                </>
              )}

              {isLinkMode ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Paste Drive / Dropbox / Video Link</label>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://drive.google.com/..."
                    value={externalUrl}
                    onChange={(e) => {
                      const v = e.target.value;
                      setExternalUrl(v);
                      if (!v.trim()) { setLinkError(null); return; }
                      const res = validateExternalUrl(v);
                      setLinkError(res.ok === false ? res.error : null);
                    }}
                    maxLength={2000}
                  />
                  {linkError ? (
                    <p className="text-xs text-destructive">{linkError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Make sure the link is accessible (set sharing to "Anyone with the link").
                    </p>
                  )}
                </div>
              ) : (
              <div className="space-y-2">
              <input ref={fileInputRef} type="file" accept={ACCEPT_ATTRIBUTE[task.media_type as 'image' | 'video' | 'audio']} onChange={handleFileSelect} className="hidden" disabled={limitReached} />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <MediaIcon className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {selectedFile.name}
                      <span className="text-muted-foreground font-normal"> · {formatFileSize(selectedFile.size)}</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadError(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => !limitReached && fileInputRef.current?.click()}
                  disabled={limitReached}
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border py-16 transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Tap to upload {config.label.toLowerCase()}</p>
                </button>
              )}
              {sizeHelperText && (
                <p className="text-xs text-muted-foreground">{sizeHelperText}</p>
              )}
              {selectedFile && previewUrl && (
                <div className="rounded-lg overflow-hidden border border-border bg-muted/40 p-2">
                  {task.media_type === 'image' && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full max-h-60 object-contain rounded-md bg-muted"
                    />
                  )}
                  {task.media_type === 'video' && (
                    <video
                      src={previewUrl}
                      controls
                      preload="metadata"
                      className="w-full max-h-60 rounded-md bg-black"
                    />
                  )}
                  {task.media_type === 'audio' && (
                    <div className="flex items-center gap-3 px-2 py-3">
                      <Mic className="h-5 w-5 text-primary shrink-0" />
                      <audio src={previewUrl} controls className="w-full" />
                    </div>
                  )}
                </div>
              )}
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  Please upload a different {task.media_type === 'image' ? 'image' : 'file'}. Avoid reusing the same file or similar content.
                </p>
              )}
            </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review summary */}
      {canSubmit && (
        <Card className="shadow-card border-primary/20">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Review</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Task</span>
              <span className="font-medium truncate ml-4">{task.title}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="secondary">{config.label}</Badge>
            </div>
            {isText && (
              <div className="text-xs text-muted-foreground bg-muted rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">{textContent}</div>
            )}
            {!isText && !isLinkMode && selectedFile && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">File</span>
                <span className="font-medium truncate ml-4">{selectedFile.name}</span>
              </div>
            )}
            {!isText && isLinkMode && externalUrl && !linkError && (
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-muted-foreground shrink-0">Link</span>
                <span className="font-medium truncate text-right">{externalUrl}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {submitting && (
        <div className="space-y-2">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">Uploading…</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => navigate(`/app/task/${taskId}`)} disabled={submitting}>
          Back
        </Button>
        <Button variant="hero" className="flex-1" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>) : (<><CheckCircle2 className="h-4 w-4" /> Submit Task</>)}
        </Button>
      </div>
    </div>
  );
}
