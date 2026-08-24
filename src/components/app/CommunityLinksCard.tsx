import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, MessageCircle, MessageSquare, Clock } from 'lucide-react';

interface CommunityLinksCardProps {
  discordUrl?: string | null;
  communityUrl?: string | null;
}

export function CommunityLinksCard({
  discordUrl,
  communityUrl,
}: CommunityLinksCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold">Community & Contributor Networks</CardTitle>
        <CardDescription className="text-xs">
          Join our active contributor channels for live support, task announcements, and platform updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Block 1: Discord Community */}
          <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-semibold text-foreground">Discord Community</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Project updates, live support, and task announcements are shared here first.
              </p>
            </div>
            {discordUrl ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => window.open(discordUrl, '_blank', 'noopener,noreferrer')}
              >
                <MessageCircle className="h-3.5 w-3.5 text-primary" /> Connect Discord <ExternalLink className="h-3.5 w-3.5 opacity-60 ml-auto" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1.5 opacity-60" disabled>
                <Clock className="h-3.5 w-3.5" /> Link coming soon
              </Button>
            )}
          </div>

          {/* Block 2: Contributor Group */}
          <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-semibold text-foreground">Contributor Group</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Announcements, labeling tips, and upcoming project opportunities.
              </p>
            </div>
            {communityUrl ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => window.open(communityUrl, '_blank', 'noopener,noreferrer')}
              >
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> Join Group <ExternalLink className="h-3.5 w-3.5 opacity-60 ml-auto" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1.5 opacity-60" disabled>
                <Clock className="h-3.5 w-3.5" /> Link coming soon
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
