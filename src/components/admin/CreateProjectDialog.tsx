import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask } from '@/services/projectService';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'Français' },
  { code: 'ha', label: 'Hausa' },
  { code: 'am', label: 'Amharic' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hi', label: 'Hindi' },
];

const formSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  instructions: z.string().trim().min(10, 'Instructions must be at least 10 characters').max(2000),
  media_type: z.enum(['text', 'audio', 'image', 'video']),
  duration_minutes: z.coerce.number().int().min(1).max(120),
  total_tasks: z.coerce.number().int().min(1).max(10000),
  visible_till: z.date().optional(),
  languages: z.array(z.string()).min(1, 'Select at least one language'),
  status: z.enum(['draft', 'active']),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ open, onOpenChange }: Props) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      instructions: '',
      media_type: 'text',
      duration_minutes: 5,
      total_tasks: 10,
      languages: ['en'],
      status: 'draft',
    },
  });

  const mutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
      toast.success('Project created successfully');
      form.reset();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create project'),
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate({
      title: values.title,
      overview: null,
      instructions: values.instructions,
      media_type: values.media_type,
      duration_minutes: values.duration_minutes,
      total_tasks: values.total_tasks,
      languages: values.languages,
      status: values.status,
      visible_till: values.visible_till ? values.visible_till.toISOString() : null,
      created_by: user?.id ?? null,
      pay_per_task: 0,
      reward_tokens: 0,
      payment_terms: 'on_completion',
      start_date: null,
      end_date: null,
      dos: [],
      donts: [],
      sample_media_urls: [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Create New Project</DialogTitle>
          <DialogDescription>
            Define a data collection task for contributors.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Record greeting in your language" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Instructions */}
            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instructions</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Step-by-step instructions for contributors…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Media Type + Duration row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="media_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="text">📝 Text</SelectItem>
                        <SelectItem value="audio">🎙️ Audio</SelectItem>
                        <SelectItem value="image">📸 Image</SelectItem>
                        <SelectItem value="video">🎬 Video</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={120} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tasks + Deadline row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="total_tasks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Tasks</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={10000} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="visible_till"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Visible Till</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-10 w-full justify-start rounded-md border-input bg-background px-3 text-sm font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                            {field.value ? format(field.value, 'PPP') : 'Optional'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">Tasks will be hidden from contributors after this date.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Languages */}
            <FormField
              control={form.control}
              name="languages"
              render={() => (
                <FormItem>
                  <FormLabel>Target Languages</FormLabel>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
                    {LANGUAGES.map(({ code, label }) => (
                      <FormField
                        key={code}
                        control={form.control}
                        name="languages"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(code)}
                                onCheckedChange={(checked) => {
                                  const current = field.value ?? [];
                                  field.onChange(
                                    checked
                                      ? [...current, code]
                                      : current.filter((v) => v !== code)
                                  );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {label}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft — publish later</SelectItem>
                      <SelectItem value="active">Active — visible immediately</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating…' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
