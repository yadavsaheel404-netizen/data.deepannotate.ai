import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Heading3, Undo, Redo, ImageIcon, Music,
  VideoIcon, TableIcon, Plus, Minus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Custom Video node extension
const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      type: { default: 'video/mp4' },
    };
  },

  parseHTML() {
    return [{ tag: 'video' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        style: 'max-width:100%; border-radius:8px;',
      }),
      ['source', { src: HTMLAttributes.src, type: HTMLAttributes.type }],
    ];
  },
});

// Custom Audio node extension
const AudioNode = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'audio' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'audio',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        style: 'width:100%;',
      }),
      ['source', { src: HTMLAttributes.src }],
    ];
  },
});

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

async function uploadMediaFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('task-media').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('task-media').getPublicUrl(path);
  return data.publicUrl;
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true, keepAttributes: true },
        orderedList: { keepMarks: true, keepAttributes: true },
        listItem: {},
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      VideoNode,
      AudioNode,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? 'Write rich instructions…' }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[180px] px-3 py-2 focus:outline-none text-foreground',
      },
    },
  });

  if (!editor) return null;

  const handleMediaUpload = async (file: File, type: 'image' | 'audio' | 'video') => {
    setUploading(true);
    try {
      const url = await uploadMediaFile(file);
      if (type === 'image') {
        editor.chain().focus().setImage({ src: url }).run();
      } else if (type === 'video') {
        editor.chain().focus().insertContent({
          type: 'video',
          attrs: { src: url, type: file.type || 'video/mp4' },
        }).run();
      } else {
        editor.chain().focus().insertContent({
          type: 'audio',
          attrs: { src: url },
        }).run();
      }
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const ToolBtn = ({
    pressed, onPressedChange, children, title, disabled,
  }: {
    pressed: boolean; onPressedChange: () => void; children: React.ReactNode; title: string; disabled?: boolean;
  }) => (
    <Toggle
      size="sm"
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label={title}
      disabled={disabled}
      className="h-8 w-8 p-0 data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
    >
      {children}
    </Toggle>
  );

  return (
    <div className="rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handleMediaUpload(f, 'image'); e.target.value = '';
      }} />
      <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handleMediaUpload(f, 'audio'); e.target.value = '';
      }} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/mov,video/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handleMediaUpload(f, 'video'); e.target.value = '';
      }} />

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border px-1 py-1 flex-wrap">
        <ToolBtn pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={editor.isActive('underline')} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolBtn pressed={editor.isActive('heading', { level: 1 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={editor.isActive('heading', { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={editor.isActive('heading', { level: 3 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolBtn pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered List">
          <ListOrdered className="h-4 w-4" />
        </ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolBtn pressed={false} onPressedChange={() => imageInputRef.current?.click()} title="Insert Image" disabled={uploading}>
          <ImageIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={false} onPressedChange={() => audioInputRef.current?.click()} title="Insert Audio" disabled={uploading}>
          <Music className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={false} onPressedChange={() => videoInputRef.current?.click()} title="Insert Video" disabled={uploading}>
          <VideoIcon className="h-4 w-4" />
        </ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Table controls */}
        <ToolBtn pressed={editor.isActive('table')} onPressedChange={() => {
          if (!editor.isActive('table')) {
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          }
        }} title="Insert Table">
          <TableIcon className="h-4 w-4" />
        </ToolBtn>
        {editor.isActive('table') && (
          <>
            <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().addRowAfter().run()} title="Add Row">
              <span className="flex items-center gap-0.5 text-[10px] font-medium"><Plus className="h-3 w-3" />R</span>
            </ToolBtn>
            <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().addColumnAfter().run()} title="Add Column">
              <span className="flex items-center gap-0.5 text-[10px] font-medium"><Plus className="h-3 w-3" />C</span>
            </ToolBtn>
            <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().deleteRow().run()} title="Delete Row">
              <span className="flex items-center gap-0.5 text-[10px] font-medium"><Minus className="h-3 w-3" />R</span>
            </ToolBtn>
            <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().deleteColumn().run()} title="Delete Column">
              <span className="flex items-center gap-0.5 text-[10px] font-medium"><Minus className="h-3 w-3" />C</span>
            </ToolBtn>
            <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().deleteTable().run()} title="Delete Table">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </ToolBtn>
          </>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn pressed={false} onPressedChange={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className="h-4 w-4" />
        </ToolBtn>

        {uploading && <span className="ml-2 text-xs text-muted-foreground animate-pulse">Uploading…</span>}
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
