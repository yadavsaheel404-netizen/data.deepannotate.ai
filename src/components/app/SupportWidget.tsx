import { useState } from 'react';
import { MessageCircle, X, Send, Paperclip, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CATEGORIES = ['Payment Issue', 'Task Problem', 'Profile Issue', 'Technical Bug', 'Other'];
const MAX_CHARS = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function SupportWidget() {
  const { user, profile } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!user) return null;

  const userName = profile?.display_name || user.email?.split('@')[0] || 'User';
  const userEmail = user.email || '';

  const reset = () => {
    setCategory('');
    setMessage('');
    setFile(null);
    setSuccess(false);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Only images are allowed');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast.error('Max file size is 5MB');
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!category) {
      toast.error('Please select a category');
      return;
    }
    if (!message.trim()) {
      toast.error('Please describe your issue');
      return;
    }

    setSubmitting(true);
    try {
      let screenshot_url: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop() || 'png';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('support-screenshots')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        // Store the storage path; signed URLs are generated on read (bucket is private)
        screenshot_url = path;
      }

      const { error } = await supabase.from('support_tickets').insert({
        user_id: user.id,
        user_name: userName,
        user_email: userEmail,
        category,
        message: message.trim(),
        screenshot_url,
      });
      if (error) throw error;

      setSuccess(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Help & Support"
          // bottom-24 on mobile clears the fixed bottom nav (~64-80px); bottom-6 on >=sm.
          // z-[9999] keeps it above any in-page content / sticky headers.
          className="fixed right-4 bottom-24 sm:right-6 sm:bottom-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-1 ring-primary/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/50 active:scale-95"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          className="fixed z-[9999] bg-card border border-border shadow-2xl flex flex-col
            inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[360px] sm:h-[480px] sm:rounded-xl
            animate-in slide-in-from-bottom-4 fade-in duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-primary/5 px-4 py-3 sm:rounded-t-xl">
            <h3 className="font-display text-base font-semibold text-foreground">Help & Support</h3>
            <button
              onClick={close}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {success ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <p className="text-sm text-foreground">
                Your message has been sent! We'll get back to you within 24 hours.
              </p>
              <Button onClick={close} className="w-full">Close</Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* User info */}
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground truncate">{userName}</div>
                  <div className="text-muted-foreground truncate">{userEmail}</div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="support-category" className="text-xs">Category</Label>
                  <select
                    id="support-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>Select a category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="support-message" className="text-xs">Message</Label>
                  <Textarea
                    id="support-message"
                    placeholder="Describe your issue in detail..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                    rows={5}
                    className="resize-none text-sm"
                  />
                  <div className="text-right text-[10px] text-muted-foreground">
                    {message.length}/{MAX_CHARS}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Attach Screenshot (optional)</Label>
                  <label className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="truncate">{file ? file.name : 'Choose image (max 5MB)'}</span>
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-border p-3 sm:rounded-b-xl">
                <Button onClick={handleSubmit} disabled={submitting || !category || !message.trim()} className="w-full gap-2">
                  <Send className="h-4 w-4" />
                  {submitting ? 'Sending...' : 'Send Message'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
