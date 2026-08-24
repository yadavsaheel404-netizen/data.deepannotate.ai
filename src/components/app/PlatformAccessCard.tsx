import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink, Copy, AlertTriangle, Clock } from 'lucide-react';

interface PlatformAccessCardProps {
  platformUrl?: string | null;
  referralCode?: string | null;
  userEmail?: string | null;
}

export function PlatformAccessCard({
  platformUrl,
  referralCode,
  userEmail,
}: PlatformAccessCardProps) {
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold">Platform Access Credentials</CardTitle>
        <CardDescription className="text-xs">
          Your target studio workspace and account linking information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 3 Info Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Info Box 1: Platform */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              PLATFORM
            </span>
            {platformUrl ? (
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline flex items-center justify-between gap-1 truncate font-medium"
                title={platformUrl}
              >
                <span className="truncate">{platformUrl.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>Link coming soon</span>
              </div>
            )}
          </div>

          {/* Info Box 2: Referral Code */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              REFERRAL CODE
            </span>
            <div className="flex items-center justify-between text-xs font-mono text-foreground font-medium">
              {referralCode ? (
                <>
                  <span className="truncate">{referralCode}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => handleCopy(referralCode, 'Referral code')}
                    title="Copy referral code"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground font-normal italic">Code coming soon</span>
              )}
            </div>
          </div>

          {/* Info Box 3: Your Email */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              YOUR EMAIL
            </span>
            <div className="flex items-center justify-between text-xs font-mono text-foreground font-medium">
              <span className="truncate" title={userEmail || 'user@example.com'}>
                {userEmail || 'user@example.com'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => handleCopy(userEmail || '', 'Email address')}
                title="Copy email address"
                disabled={!userEmail}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Warning Line */}
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 flex items-start gap-2.5 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Sign up with this exact email address on the client studio platform, or your completed tasks cannot be linked back to your DataForge account for payout distribution.
          </p>
        </div>

        {/* Reassurance Line */}
        <p className="text-xs text-muted-foreground text-center sm:text-left">
          Most contributor accounts are synchronized within a few hours — your wallet balance will automatically update as tasks complete.
        </p>
      </CardContent>
    </Card>
  );
}
