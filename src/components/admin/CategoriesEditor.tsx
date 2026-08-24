import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown } from 'lucide-react';

export interface ProjectCategory {
  id?: string;
  category_name: string;
  welcome_message: string;
  category_overview: string;
}

interface Props {
  categories: ProjectCategory[];
  onChange: (next: ProjectCategory[]) => void;
}

const empty = (): ProjectCategory => ({
  category_name: '',
  welcome_message: '',
  category_overview: '',
});

export function CategoriesEditor({ categories, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectCategory>(empty());

  const startAdd = () => {
    setDraft(empty());
    setEditingIndex(categories.length);
  };

  const startEdit = (i: number) => {
    setDraft({ ...categories[i] });
    setEditingIndex(i);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(empty());
  };

  const saveEdit = () => {
    if (!draft.category_name.trim()) return;
    const next = [...categories];
    if (editingIndex !== null && editingIndex < categories.length) {
      next[editingIndex] = draft;
    } else {
      next.push(draft);
    }
    onChange(next);
    cancelEdit();
  };

  const remove = (i: number) => {
    const next = categories.filter((_, idx) => idx !== i);
    onChange(next);
    if (editingIndex === i) cancelEdit();
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const isEditingExisting = editingIndex !== null && editingIndex < categories.length;
  const isAdding = editingIndex !== null && editingIndex >= categories.length;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {categories.length === 0 && !isAdding && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No categories yet. Add at least one to organize this project.
          </p>
        )}

        {categories.map((c, i) => (
          <div key={c.id ?? `${i}-${c.category_name}`} className="rounded-md border border-border bg-background/50 p-3">
            {editingIndex === i ? (
              <CategoryForm
                draft={draft}
                setDraft={setDraft}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === categories.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{c.category_name}</p>
                  {c.welcome_message && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.welcome_message}</p>
                  )}
                  {c.category_overview && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.category_overview}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(i)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {isAdding && (
          <div className="rounded-md border border-primary/40 bg-background/50 p-3">
            <CategoryForm
              draft={draft}
              setDraft={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          </div>
        )}
      </div>

      {!isEditingExisting && !isAdding && (
        <Button type="button" variant="outline" onClick={startAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      )}
    </div>
  );
}

function CategoryForm({
  draft, setDraft, onSave, onCancel,
}: {
  draft: ProjectCategory;
  setDraft: (c: ProjectCategory) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Category Name *</label>
        <Input
          value={draft.category_name}
          onChange={(e) => setDraft({ ...draft, category_name: e.target.value })}
          placeholder="e.g. Cooking"
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Welcome Message</label>
        <Textarea
          value={draft.welcome_message}
          onChange={(e) => setDraft({ ...draft, welcome_message: e.target.value })}
          placeholder="e.g. Please select Cooking if your submission contains kitchen activities."
          rows={2}
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Category Overview</label>
        <Textarea
          value={draft.category_overview}
          onChange={(e) => setDraft({ ...draft, category_overview: e.target.value })}
          placeholder="e.g. Capture a natural first-person cooking activity with hands and tools visible."
          rows={3}
          className="mt-1"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={!draft.category_name.trim()}>
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}
