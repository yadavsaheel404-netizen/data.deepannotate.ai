import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { sendTip } from '@/services/walletService';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

interface TipTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTokens: number;
  onSuccess?: () => void;
}

const MIN_TIP = 10;
const MAX_TIP = 1000;
const PUBLIC_ID_RE = /^DF-\d{6}$/i;

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You must be signed in to send tips.',
  INVALID_RECIPIENT: 'Enter a valid User ID (e.g. DF-482193).',
  RECIPIENT_NOT_FOUND: 'User not found.',
  RECIPIENT_INACTIVE: 'This recipient account is inactive.',
  SELF_TIP_NOT_ALLOWED: 'You cannot tip yourself.',
  AMOUNT_TOO_LOW: `Minimum tip is ${MIN_TIP} tokens.`,
  AMOUNT_TOO_HIGH: `Maximum tip is ${MAX_TIP} tokens per transaction.`,
  INSUFFICIENT_TOKENS: 'You do not have enough tokens for this tip.',
  DAILY_CAP_EXCEEDED: 'Daily tipping limit reached. Try again tomorrow.',
  INVALID_AMOUNT: 'Enter a valid whole number of tokens.',
};

export function TipTokensDialog({ open, onOpenChange, currentTokens, onSuccess }: TipTokensDialogProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRecipientId('');
    setAmount('');
    setNote('');
  };

  const handleClose = (next: boolean) => {
    if (!submitting) {
      if (!next) reset();
      onOpenChange(next);
    }
  };

  const handleSubmit = async () => {
    const trimmedId = recipientId.trim().toUpperCase();
    const numAmount = Number(amount);

    if (!trimmedId) {
      toast.error('Enter a valid User ID (e.g. DF-482193).');
      return;
    }
    if (!PUBLIC_ID_RE.test(trimmedId)) {
      toast.error('Enter a valid User ID (e.g. DF-482193).');
      return;
    }
    if (!Number.isInteger(numAmount) || numAmount < MIN_TIP) {
      toast.error(`Minimum tip is ${MIN_TIP} tokens.`);
      return;
    }
    if (numAmount > MAX_TIP) {
      toast.error(`Maximum tip is ${MAX_TIP} tokens.`);
      return;
    }
    if (numAmount > currentTokens) {
      toast.error('You do not have enough tokens.');
      return;
    }

    setSubmitting(true);
    try {
      // Quick self-tip guard before hitting the server
      if (userId) {
        const { data: me } = await supabase
          .from('profiles')
          .select('public_user_id')
          .eq('id', userId)
          .maybeSingle();
        if (me?.public_user_id && me.public_user_id.toUpperCase() === trimmedId) {
          toast.error('You cannot tip yourself.');
          setSubmitting(false);
          return;
        }
      }

      await sendTip({
        recipientPublicId: trimmedId,
        amount: numAmount,
        note: note.trim() || undefined,
      });
      toast.success('Tip sent successfully', {
        description: `${numAmount} tokens deducted from your wallet.`,
      });
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      const code = err?.message || '';
      toast.error(ERROR_MESSAGES[code] || 'Failed to send tip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Tip Tokens
          </DialogTitle>
          <DialogDescription>
            Send tokens to another contributor. Min {MIN_TIP}, max {MAX_TIP} per tip.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tip-recipient">Recipient User ID</Label>
            <Input
              id="tip-recipient"
              placeholder="e.g. DF-482193"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value.toUpperCase())}
              disabled={submitting}
              maxLength={9}
              className="font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              Ask the recipient for their User ID, shown on their profile.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tip-amount">Tokens</Label>
            <Input
              id="tip-amount"
              type="number"
              min={MIN_TIP}
              max={MAX_TIP}
              step={1}
              placeholder={`${MIN_TIP} - ${MAX_TIP}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Available: {currentTokens.toLocaleString()} tokens
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tip-note" className="flex items-center justify-between">
              <span>Note (optional)</span>
              <span className="text-[11px] text-muted-foreground font-normal">{note.length}/140</span>
            </Label>
            <Textarea
              id="tip-note"
              placeholder="Say something nice…"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              disabled={submitting}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Send Tip
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
