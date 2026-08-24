import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Upload, Link as LinkIcon, X, Loader2, GripVertical,
  Play, Image as ImageIcon, Music, FileText, CheckCircle2, XCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type ExampleKind = 'good' | 'bad';
export type ExampleMediaType = 'image' | 'video' | 'audio' | 'link';
export type ExampleSource = 'upload' | 'link';

export interface ExampleMediaItem {
  id: string;
  kind: ExampleKind;
  source: ExampleSource;
  media_type: ExampleMediaType;
  url: string;
  title: string;
  note: string;
}

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB

export function inferMediaType(url: string): ExampleMediaType {
  const lower = url.toLowerCase().split('?')[0];
  const ext = lower.split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (
    /drive\.google\.com|dropbox\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|box\.com|wetransfer\.com/.test(lower)
  ) return 'link';
  return 'link';
}

const KIND_THEME = {
  good: {
    border: 'border-success/40',
    headerBg: 'bg-success/10',
    headerText: 'text-success',
    badge: 'bg-success text-white',
    Icon: CheckCircle2,
    label: 'Good Example',
    badgeText: 'DO',
    badgeVariant: 'default' as const,
    addBtn: 'border-success/40 text-success hover:bg-success/10',
  },
  bad: {
    border: 'border-rose-500/40',
    headerBg: 'bg-rose-500/10',
    headerText: 'text-rose-700 dark:text-rose-400',
    badge: 'bg-rose-500 text-white',
    Icon: XCircle,
    label: 'Bad Example',
    addBtn: 'border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10',
  },
} as const;

interface Props {
  items: ExampleMediaItem[];
  onChange: (items: ExampleMediaItem[]) => void;
}

export function ExampleMediaEditor({ items, onChange }: Props) {
  const good = items.filter((i) => i.kind === 'good');
  const bad = items.filter((i) => i.kind === 'bad');

  const update = (id: string, patch: Partial<ExampleMediaItem>) => {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const add = (item: ExampleMediaItem) => onChange([...items, item]);

  // Drag reorder within same kind
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (overId: string, kind: ExampleKind) => {
    const fromId = dragId.current;
    dragId.current = null;
    if (!fromId || fromId === overId) return;
    const from = items.find((i) => i.id === fromId);
    const over = items.find((i) => i.id === overId);
    if (!from || !over || from.kind !== kind || over.kind !== kind) return;
    const reordered = [...items];
    const fromIdx = reordered.findIndex((i) => i.id === fromId);
    const [moved] = reordered.splice(fromIdx, 1);
    const overIdx = reordered.findIndex((i) => i.id === overId);
    reordered.splice(overIdx, 0, moved);
    onChange(reordered);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Group
        kind="good"
        items={good}
        onAdd={add}
        onUpdate={update}
        onRemove={remove}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={(id) => onDrop(id, 'good')}
      />
      <Group
        kind="bad"
        items={bad}
        onAdd={add}
        onUpdate={update}
        onRemove={remove}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={(id) => onDrop(id, 'bad')}
      />
    </div>
  );
}

interface GroupProps {
  kind: ExampleKind;
  items: ExampleMediaItem[];
  onAdd: (item: ExampleMediaItem) => void;
  onUpdate: (id: string, patch: Partial<ExampleMediaItem>) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (id: string) => void;
}

function Group({ kind, items, onAdd, onUpdate, onRemove, onDragStart, onDragOver, onDrop }: GroupProps) {
  const theme = KIND_THEME[kind];
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name} exceeds 1 GB. Use a Drive/Dropbox link instead.`);
          continue;
        }
        const path = `examples/${kind}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('task-media').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('task-media').getPublicUrl(path);
        const mt = inferMediaType(file.name);
        onAdd({
          id: crypto.randomUUID(),
          kind,
          source: 'upload',
          media_type: mt,
          url: urlData.publicUrl,
          title: '',
          note: '',
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    try {
      // basic url validation
      new URL(url);
    } catch {
      toast.error('Enter a valid URL');
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      kind,
      source: 'link',
      media_type: inferMediaType(url),
      url,
      title: '',
      note: '',
    });
    setLinkUrl('');
    setShowLink(false);
  };

  return (
    <div className={cn('rounded-xl border-2 overflow-hidden', theme.border)}>
      <div className={cn('flex items-center gap-2 px-4 py-2.5', theme.headerBg)}>
        <theme.Icon className={cn('h-5 w-5', theme.headerText)} />
        <span className={cn('font-display font-semibold text-sm', theme.headerText)}>
          {theme.label}s
        </span>
        <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full', theme.badge)}>
          {items.length}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No {theme.label.toLowerCase()}s yet. Add reference media below.
          </p>
        )}

        {items.map((item) => (
          <ExampleCard
            key={item.id}
            item={item}
            theme={theme}
            onUpdate={(patch) => onUpdate(item.id, patch)}
            onRemove={() => onRemove(item.id)}
            onDragStart={() => onDragStart(item.id)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(item.id)}
          />
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <label className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors',
            theme.addBtn,
            uploading && 'opacity-60 pointer-events-none',
          )}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? 'Uploading…' : 'Upload file'}
            <input
              type="file"
              multiple
              accept="image/*,audio/*,video/*"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowLink((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
              theme.addBtn,
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Add link
          </button>
        </div>

        {showLink && (
          <div className="flex gap-2 pt-1">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Google Drive / Dropbox / OneDrive / direct URL"
              className="text-sm h-9"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
            />
            <Button type="button" size="sm" onClick={handleAddLink}>Add</Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Up to 1 GB per file · Drive, Dropbox, OneDrive links supported
        </p>
      </div>
    </div>
  );
}

interface CardProps {
  item: ExampleMediaItem;
  theme: typeof KIND_THEME[ExampleKind];
  onUpdate: (patch: Partial<ExampleMediaItem>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

function ExampleCard({ item, theme, onUpdate, onRemove, onDragStart, onDragOver, onDrop }: CardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border bg-card overflow-hidden group',
        theme.border,
      )}
    >
      <MediaPreview item={item} theme={theme} />
      <div className="p-2.5 space-y-2">
        <div className="flex items-start gap-1.5">
          <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0 cursor-move" />
          <Input
            value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={item.kind === 'good' ? 'e.g. Proper hand visibility' : 'e.g. Wrong camera angle'}
            className="h-8 text-sm font-medium"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Textarea
          value={item.note}
          onChange={(e) => onUpdate({ note: e.target.value })}
          placeholder="Reason / note (why this is a good or bad example)"
          rows={2}
          className="text-xs resize-none"
        />
      </div>
    </div>
  );
}

function MediaPreview({ item, theme }: { item: ExampleMediaItem; theme: typeof KIND_THEME[ExampleKind] }) {
  const wrapperBase = 'relative w-full aspect-video bg-muted flex items-center justify-center';
  if (item.media_type === 'image') {
    return (
      <div className={wrapperBase}>
        <img src={item.url} alt={item.title || 'Example'} className="w-full h-full object-cover" />
        <KindBadge theme={theme} />
      </div>
    );
  }
  if (item.media_type === 'video' && item.source === 'upload') {
    return (
      <div className={cn(wrapperBase, 'bg-black')}>
        <video
          src={item.url}
          className="w-full h-full object-contain"
          preload="metadata"
          controls
        />
        <KindBadge theme={theme} />
      </div>
    );
  }
  if (item.media_type === 'audio' && item.source === 'upload') {
    return (
      <div className={cn(wrapperBase, 'flex-col gap-2 px-3')}>
        <Music className="h-8 w-8 text-muted-foreground" />
        <audio src={item.url} controls className="w-full" />
        <KindBadge theme={theme} />
      </div>
    );
  }
  // Link or unknown — show video-style placeholder with play overlay
  const Icon = item.media_type === 'audio' ? Music : item.media_type === 'video' ? Play : FileText;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(wrapperBase, 'bg-gradient-to-br from-muted to-muted/50 flex-col gap-1.5 hover:opacity-90 transition')}
    >
      <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center shadow">
        {item.media_type === 'video' ? <Play className="h-5 w-5 ml-0.5" /> : <Icon className="h-5 w-5" />}
      </div>
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 max-w-[90%] truncate px-2">
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="truncate">{new URL(item.url).hostname}</span>
      </span>
      <KindBadge theme={theme} />
    </a>
  );
}

function KindBadge({ theme }: { theme: typeof KIND_THEME[ExampleKind] }) {
  return (
    <span className={cn('absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded', theme.badge)}>
      <theme.Icon className="h-3 w-3" />
      {theme.label.toUpperCase()}
    </span>
  );
}
