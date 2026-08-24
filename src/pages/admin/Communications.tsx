import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { MessageSquare, Send, Inbox, Plus, Save } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const PREDEFINED_TEMPLATES = [
  { name: 'Project Invitation', subject: 'New Project Available for You!', body: 'Hi there! A new project matching your skills is now available. Check it out in your project feed.' },
  { name: 'Payment Released', subject: 'Payment Has Been Released', body: 'Great news! Your payment has been processed and credited to your wallet.' },
  { name: 'Task Rejected', subject: 'Task Requires Revision', body: 'Your recent task needs some changes. Please check the feedback and resubmit.' },
];

export default function Communications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'country' | 'custom'>('all');
  const [countryFilter, setCountryFilter] = useState('');
  const [sending, setSending] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Fetch communication history
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['communications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const sendNotification = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    if (!user) return;
    setSending(true);

    try {
      // Get recipient user IDs
      let query = supabase.from('profiles').select('id');
      if (recipientType === 'country' && countryFilter) {
        query = query.eq('country', countryFilter);
      }
      const { data: recipients, error: recErr } = await query;
      if (recErr) throw recErr;

      const recipientIds = (recipients ?? []).map((r: any) => r.id);
      if (recipientIds.length === 0) {
        toast.error('No recipients found');
        setSending(false);
        return;
      }

      // Create in-app notifications for each recipient
      const notifications = recipientIds.map((uid: string) => ({
        user_id: uid,
        title: subject,
        message: body,
      }));

      // Insert in batches of 100
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        const { error } = await supabase.from('notifications').insert(batch);
        if (error) throw error;
      }

      // Log the communication
      const { error: logErr } = await supabase.from('communications').insert({
        subject,
        body,
        recipients: recipientIds,
        recipient_count: recipientIds.length,
        status: 'sent',
        sent_by: user.id,
      });
      if (logErr) throw logErr;

      toast.success(`Notification sent to ${recipientIds.length} user(s)`);
      setSubject('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['communications'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (tmpl: { subject: string; body: string }) => {
    setSubject(tmpl.subject);
    setBody(tmpl.body);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Communications</h1>
          <p className="text-sm text-muted-foreground">Send in-app notifications to contributors</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
          <Card>
            <CardHeader><CardTitle className="text-base font-display">New Notification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Recipients</Label>
                <Select value={recipientType} onValueChange={(v: any) => setRecipientType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contributors</SelectItem>
                    <SelectItem value="country">By Country</SelectItem>
                  </SelectContent>
                </Select>
                {recipientType === 'country' && (
                  <Select value={countryFilter} onValueChange={setCountryFilter}>
                    <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="India">India</SelectItem>
                      <SelectItem value="Philippines">Philippines</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Notification title" maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Message</Label>
                <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." rows={5} maxLength={2000} />
              </div>
              <Button onClick={sendNotification} disabled={sending} variant="hero">
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Sending…' : 'Send Notification'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader><CardTitle className="text-base font-display">Quick Templates</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {PREDEFINED_TEMPLATES.map((t) => (
                  <div key={t.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.subject}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => applyTemplate(t)}>
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No communications sent yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                        <TableCell className="text-sm font-medium">{c.subject}</TableCell>
                        <TableCell className="text-sm">{c.recipient_count}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'sent' ? 'default' : 'destructive'} className="capitalize">{c.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
