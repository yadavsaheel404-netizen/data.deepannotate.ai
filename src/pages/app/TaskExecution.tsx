import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { isTaskAcceptingSubmissions } from '@/lib/taskStatus';
import type { Task } from '@/types/project';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Clock, Users, Type, Mic, Camera, Video, FileText, IndianRupee, Calendar, BookOpen, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/formatMoney';

const MEDIA_CONFIG: Record<string, { icon: React.ElementType; label: string; hint: string }> = {
  text: { icon: Type, label: 'Text', hint: 'Type your response in the text box.' },
  audio: { icon: Mic, label: 'Audio', hint: 'Upload an audio recording (MP3, WAV, M4A).' },
  image: { icon: Camera, label: 'Image', hint: 'Upload a photo or image (JPG, PNG, WebP).' },
  video: { icon: Video, label: 'Video', hint: 'Upload a video file (MP4, MOV, WebM).' },
};

export default function TaskExecution() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

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
    })();
  }, [taskId, navigate]);

  const handleStartSubmit = () => {
    // Tasks are independent of profile completion. Anyone signed in can start.
    navigate(`/app/task/${taskId}/instructions`);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!task) return null;

  const config = MEDIA_CONFIG[task.media_type];
  const accepting = isTaskAcceptingSubmissions(task);
  const tasksLeft = Math.max(0, task.total_tasks - task.filled_tasks);
  const MediaIcon = config.icon;
  const payLabel = task.pay_per_task > 0 ? `₹${formatMoney(task.pay_per_task)} per hour` : null;
  const endLabel = task.end_date ? format(new Date(task.end_date), 'dd MMM yyyy') : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] animate-slide-up pb-8 bg-[#F7F9FA]">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app')} className="text-[#0A1628] hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold text-[#0A1628] truncate">{task.title}</h1>
          <div className="flex items-center gap-3 text-xs text-[#6B7280]">
            <span className="inline-flex items-center gap-1 font-medium"><Clock className="h-3 w-3 text-[#06B6D4]" />{task.duration_label || (task.duration_minutes != null ? `${task.duration_minutes}m` : '—')}</span>
            <span className="inline-flex items-center gap-1 font-medium"><Users className="h-3 w-3 text-[#06B6D4]" />{tasksLeft} tasks left</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-[#0A1628] font-medium border-none">{config.label}</Badge>
            {!accepting && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Closed</Badge>}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {task.overview && (
          <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(6,182,212,0.08)]">
                  <FileText className="h-5 w-5 text-[#06B6D4]" />
                </div>
                <h2 className="font-display text-base font-bold text-[#0A1628]">Overview</h2>
              </div>
              <p className="text-sm text-[#0A1628] leading-relaxed whitespace-pre-wrap">{task.overview}</p>
            </CardContent>
          </Card>
        )}

        {(payLabel || endLabel) && (
          <Card className="bg-white border border-[#E5E7EB] shadow-none rounded-xl">
            <CardContent className="p-4 space-y-1">
              {payLabel && (
                <p className="text-sm font-bold text-[#06B6D4] inline-flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5" /> {payLabel}
                  {task.reward_tokens > 0 && <span className="text-[#6B7280] font-normal ml-1">+ {task.reward_tokens} tokens</span>}
                </p>
              )}
              {task.start_date && task.end_date && (
                <p className="text-xs text-[#6B7280] inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-[#06B6D4]" />
                  {format(new Date(task.start_date), 'MMM d')} – {format(new Date(task.end_date), 'MMM d, yyyy')}
                </p>
              )}
              {endLabel && <p className="text-xs text-[#9CA3AF]">Deadline: {endLabel}</p>}
            </CardContent>
          </Card>
        )}

        <Card className="bg-[rgba(6,182,212,0.08)] border border-[#06B6D4]/20 shadow-none rounded-xl">
          <CardContent className="flex items-start gap-3 p-4">
            <MediaIcon className="h-5 w-5 text-[#06B6D4] shrink-0 mt-0.5" />
            <p className="text-sm text-[#0A1628] font-medium">{config.hint}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 pt-4 mt-auto">
        <Button className="w-full bg-[#0A1628] text-white hover:bg-[#050C16] font-semibold border-none h-11" onClick={handleStartSubmit} disabled={!accepting}>
          {accepting ? 'Start Task' : 'Task Closed'}
        </Button>

        {/* Guidelines & Platform Access Single Secondary Button */}
        {task.has_guidelines_hub && (
          <Button
            variant="outline"
            className="w-full gap-2 text-xs font-semibold bg-white border border-[#E5E7EB] text-[#0A1628] hover:bg-slate-50 h-10"
            onClick={() => navigate(`/app/task/${task.id}/guidelines`)}
          >
            <BookOpen className="h-4 w-4 text-[#06B6D4]" />
            View Guidelines & Platform Access
            <ArrowRight className="h-3.5 w-3.5 ml-auto text-[#06B6D4]" />
          </Button>
        )}
      </div>
    </div>
  );
}
