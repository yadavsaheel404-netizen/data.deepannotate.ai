import type { Task } from '@/types/project';
import { getEffectiveTaskStatus } from '@/lib/taskStatus';
import { formatMoney } from '@/lib/formatMoney';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, UsersRound, Type, Mic, Camera, Video, ChevronRight, Calendar, Sparkles, Wallet, CheckCircle2, Inbox, Target } from 'lucide-react';
import { format } from 'date-fns';

const MEDIA_ICONS: Record<string, React.ElementType> = {
  text: Type, audio: Mic, image: Camera, video: Video,
};
const MEDIA_LABELS: Record<string, string> = {
  text: 'Text', audio: 'Audio', image: 'Image', video: 'Video',
};

function toSentenceCase(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

interface TaskCardProps {
  task: Task & { submissions_count?: number; approved_count?: number };
  onSelect?: (task: Task) => void;
}

export default function TaskCard({ task, onSelect }: TaskCardProps) {
  const MediaIcon = MEDIA_ICONS[task.media_type] ?? Type;
  const effectiveStatus = getEffectiveTaskStatus(task);
  const isClosed = effectiveStatus !== 'active';
  const tasksLeft = Math.max(0, task.total_tasks - task.filled_tasks);

  const hasDateRange = task.start_date && task.end_date;
  const hasDeadline = !!task.visible_till;
  const hasEarnings = task.pay_per_task > 0 || task.reward_tokens > 0;

  const submissions = task.submissions_count ?? task.filled_tasks;
  const approved = task.approved_count ?? task.filled_tasks;
  const fillPct = task.total_tasks > 0 ? Math.min(100, Math.round((approved / task.total_tasks) * 100)) : 0;
  const almostFull = !isClosed && task.total_tasks > 0 && approved / task.total_tasks > 0.8;
  const beTheFirst = !isClosed && approved === 0;
  const isTargeted = task.visibility_type === 'targeted';

  return (
    <Card
      className={`bg-white border border-[#E5E7EB] shadow-none transition-all ${isClosed ? 'opacity-60 cursor-not-allowed' : 'hover:border-[#06B6D4] cursor-pointer active:scale-[0.99]'}`}
      onClick={() => !isClosed && onSelect?.(task)}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgba(6,182,212,0.08)]">
          <MediaIcon className="h-6 w-6 text-[#06B6D4]" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <div className="flex items-start gap-2">
            <h3 className="font-display text-sm font-bold text-[#0A1628] leading-snug break-words line-clamp-2 flex-1">
              {toSentenceCase(task.title)}
            </h3>
            {isTargeted ? (
              <Badge variant="outline" className="border-0 bg-[rgba(6,182,212,0.12)] text-[#06B6D4] text-[10px] font-semibold px-2 py-0.5 shrink-0" title="Matched based on your profile">
                For You
              </Badge>
            ) : (
              <Badge variant="outline" className="border-0 bg-slate-100 text-[#6B7280] text-[10px] font-medium px-2 py-0.5 shrink-0">
                General
              </Badge>
            )}
          </div>

          {/* Row 1: duration · slots-left · type badge · status */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7280]">
            <span className="inline-flex items-center gap-1 font-medium">
              <Clock className="h-3.5 w-3.5 text-[#06B6D4]" />
              {task.duration_label || (task.duration_minutes != null ? `${task.duration_minutes}m` : '—')}
            </span>
            {isClosed ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Closed</Badge>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium">
                <UsersRound className="h-3.5 w-3.5 text-[#06B6D4]" />
                {tasksLeft} tasks left
              </span>
            )}
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-slate-100 text-[#0A1628] font-medium border-none">
              {MEDIA_LABELS[task.media_type]}
            </Badge>
          </div>

          {/* Row 2: date range / visible-till */}
          {(hasDateRange || hasDeadline) && (
            <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[#06B6D4]" />
              {hasDateRange ? (
                <span>{format(new Date(task.start_date!), 'MMM d')} – {format(new Date(task.end_date!), 'MMM d, yyyy')}</span>
              ) : (
                <span>Visible till: {format(new Date(task.visible_till!), 'dd MMM yyyy')}</span>
              )}
            </div>
          )}

          {/* Row 3: earnings + tokens */}
          {hasEarnings && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {task.pay_per_task > 0 && (
                <span className="font-bold text-[#06B6D4] inline-flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  ₹{formatMoney(task.pay_per_task)}/hr
                </span>
              )}
              {task.reward_tokens > 0 && (
                <span className="font-bold text-[#06B6D4] inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  +{task.reward_tokens} tokens
                </span>
              )}
            </div>
          )}

          {/* Row 4: approved · submissions · slots + progress */}
          <div className="space-y-1 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-[#6B7280]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-[#06B6D4]" />
                  {approved.toLocaleString()} approved
                </span>
                <span className="inline-flex items-center gap-1">
                  <Inbox className="h-3 w-3 text-[#9CA3AF]" />
                  {submissions.toLocaleString()} submissions
                </span>
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3 w-3 text-[#9CA3AF]" />
                  {task.total_tasks.toLocaleString()} tasks
                </span>
              </div>
              <span className="tabular-nums font-semibold text-[#0A1628]">{fillPct}%</span>
            </div>
            <Progress value={fillPct} className="h-1 bg-slate-100" />
            {(almostFull || beTheFirst) && (
              <div className="pt-0.5">
                {almostFull && (
                  <Badge variant="outline" className="border-0 bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0 font-medium">
                    Almost full
                  </Badge>
                )}
                {beTheFirst && (
                  <Badge variant="outline" className="border-0 bg-[rgba(6,182,212,0.12)] text-[#06B6D4] text-[10px] px-1.5 py-0 font-medium">
                    Be the first to complete
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-[#06B6D4] self-center" />
      </CardContent>
    </Card>
  );
}
