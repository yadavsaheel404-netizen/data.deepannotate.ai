import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlatformAccessCard } from '@/components/app/PlatformAccessCard';
import { CommunityLinksCard } from '@/components/app/CommunityLinksCard';
import type { Task } from '@/types/project';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Award,
  Sparkles,
  UserCheck,
  ArrowRight,
  FileText,
  PlayCircle,
  Video,
  Target,
  TrendingUp,
  Layers,
  Laptop,
  Globe,
  Zap,
  ArrowLeft,
  Clock,
} from 'lucide-react';

export default function GuidelinesDetail() {
  const { slug, taskId } = useParams<{ slug?: string; taskId?: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [orientationReviewed, setOrientationReviewed] = useState(true);

  // Fetch single project matching taskId or slug from public.projects
  const { data: project, isLoading } = useQuery<Task | null>({
    queryKey: ['guidelines-project-detail', taskId || slug],
    queryFn: async () => {
      const targetKey = taskId || slug;
      if (!targetKey) return null;

      // Try searching by id first
      const { data: byId } = await supabase
        .from('projects')
        .select('*')
        .eq('id', targetKey)
        .maybeSingle();

      if (byId) return byId as unknown as Task;

      // Fallback: search by slug
      const { data: bySlug } = await supabase
        .from('projects')
        .select('*')
        .eq('slug', targetKey)
        .maybeSingle();

      if (bySlug) return bySlug as unknown as Task;

      return null;
    },
  });

  const isProfileComplete = Boolean(profile?.display_name && profile?.email);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-36 bg-muted rounded" />
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-48 w-full bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/app/tasks')}
          className="text-xs text-primary hover:underline p-0 h-auto gap-1 font-medium inline-flex items-center"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to My Projects
        </Button>
        <Card className="bg-card border-border text-center py-12 px-6">
          <CardContent className="space-y-3 max-w-md mx-auto">
            <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="font-display text-base font-semibold text-foreground">Project guide not found</h3>
            <p className="text-xs text-muted-foreground">
              The project guide you requested standard materials for could not be found or has ended.
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate('/app/tasks')}>
              Back to My Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 bg-[#F7F9FA]">
      {/* Back Link & Page Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/app/task/${project.id}`)}
          className="text-xs text-[#06B6D4] hover:underline p-0 h-auto gap-1 font-semibold inline-flex items-center"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Project Details
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#06B6D4]" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0A1628]">
              {project.title} — Guidelines & Access
            </h1>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            {project.short_description || project.overview || 'Onboarding, quality calibration, and studio access guide.'}
          </p>
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-5 bg-white border border-[#E5E7EB] p-1">
          <TabsTrigger value="overview" className="text-xs font-medium gap-1">
            <UserCheck className="h-3.5 w-3.5 hidden sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="eligibility" className="text-xs font-medium gap-1">
            <ShieldCheck className="h-3.5 w-3.5 hidden sm:inline" />
            Eligibility
          </TabsTrigger>
          <TabsTrigger value="orientation" className="text-xs font-medium gap-1">
            <FileText className="h-3.5 w-3.5 hidden sm:inline" />
            Orientation
          </TabsTrigger>
          <TabsTrigger value="skills" className="text-xs font-medium gap-1">
            <Award className="h-3.5 w-3.5 hidden sm:inline" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="access" className="text-xs font-medium gap-1">
            <Sparkles className="h-3.5 w-3.5 hidden sm:inline" />
            Access
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          {/* 1. Status Banner Card */}
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      Contributor Standing: {isProfileComplete ? 'Profile Complete' : 'Account Active'}
                    </h3>
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                      Verified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Welcome, {profile?.display_name || profile?.email || 'Contributor'}. Your account is initialized for {project.title}.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/app/profile')}>
                Profile Settings
              </Button>
            </CardContent>
          </Card>

          {/* 2. Platform Access Credentials Card (scoped to project) */}
          <PlatformAccessCard
            platformUrl={project.platform_url}
            referralCode={project.referral_code}
            userEmail={profile?.email}
          />

          {/* 3. Community & Contributor Networks Card (scoped to project) */}
          <CommunityLinksCard
            discordUrl={project.discord_url}
            communityUrl={project.community_url}
          />

          {/* 4. Path to Client Project Mini-Summary */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-semibold">Your Path to the Client Project</CardTitle>
              <CardDescription className="text-xs">
                Explore the five key sections of this guide to understand project standards and workspace tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {[
                  { id: 'overview', step: '1', name: 'Overview', desc: 'Account & Standing' },
                  { id: 'eligibility', step: '2', name: 'Eligibility', desc: 'Criteria & Location' },
                  { id: 'orientation', step: '3', name: 'Orientation', desc: 'Video & Doc Specs' },
                  { id: 'skills', step: '4', name: 'Skills', desc: 'Quality & Benchmarks' },
                  { id: 'access', step: '5', name: 'Access', desc: 'Launch Studio' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`text-left p-3 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                      activeTab === item.id
                        ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                        : 'border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-primary">
                        Step {item.step}
                      </span>
                      <ArrowRight className="h-3 w-3 opacity-60" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* High-level Platform Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <Layers className="h-4 w-4" /> Multimodal Tasks
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Annotate bounding boxes, keyframes, and temporal video segments for computer vision datasets.
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <TrendingUp className="h-4 w-4" /> Micro-Rewards
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Earn token rewards for approved task submissions, tracked directly in your platform Wallet.
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <Target className="h-4 w-4" /> Quality Calibration
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Automated IoU overlap checks ensure high-precision data standards and fast-tracked payouts.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2" onClick={() => setActiveTab('eligibility')}>
                  Explore Eligibility Requirements <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: ELIGIBILITY */}
        <TabsContent value="eligibility" className="space-y-6">
          <Card className="bg-success/10 border-success/30">
            <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center text-success shrink-0 mt-0.5 sm:mt-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      Eligibility Check Cleared
                    </h3>
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                      Passed
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your contributor account meets all technical, geographic, and identity compliance requirements for {project.title}.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-semibold">Project Qualification Criteria</CardTitle>
              <CardDescription className="text-xs">
                General requirements for claiming and submitting computer vision annotation tasks on DataForge.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <UserCheck className="h-4 w-4 text-primary" /> Age & Identity Compliance
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be 18 years or older with an active, verified contributor profile in good standing.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <Laptop className="h-4 w-4 text-primary" /> Hardware & Browser Specs
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Desktop or Laptop with Chrome or Firefox, a mouse or trackpad, and min. 1080p display resolution.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <Globe className="h-4 w-4 text-primary" /> Language Proficiency
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Working proficiency in English (or target dataset language) for label taxonomy accuracy.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <Zap className="h-4 w-4 text-primary" /> Network & Availability
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum 10 Mbps broadband connection for streaming video segments and saving keyframes.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-0.5 text-center sm:text-left">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Profile Completeness Status
                  </span>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2 justify-center sm:justify-start">
                    <span>{isProfileComplete ? '100% Verified Profile' : '85% Profile Completed'}</span>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                      {isProfileComplete ? 'Complete' : 'Action Optional'}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/app/profile')}>
                  Update Details
                </Button>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2" onClick={() => setActiveTab('orientation')}>
                  Next: Learning Materials <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ORIENTATION */}
        <TabsContent value="orientation" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="font-display text-base font-semibold">Your Learning Materials</CardTitle>
                </div>
                <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                  Orientation Active
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Review these essential training materials to ensure precision labeling and high submission approval rates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {/* Resource 1 */}
                <div className="p-4 rounded-lg border border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-foreground">Project Walkthrough & Video Tutorial</h4>
                        <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                          Completed
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Overview covering bounding box tools, keyboard hotkeys, and final submission flow.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0 self-end sm:self-center">
                    <PlayCircle className="h-3.5 w-3.5 text-primary" /> Watch Video
                  </Button>
                </div>

                {/* Resource 2 */}
                <div className="p-4 rounded-lg border border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-foreground">Annotation Guidelines & Spec Document</h4>
                        <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                          Completed
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Specification rules for tight margins, occlusion tagging, and class taxonomies.
                      </p>
                    </div>
                  </div>
                  {project.guidelines_doc_url ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0 self-end sm:self-center"
                      onClick={() => window.open(project.guidelines_doc_url!, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-primary" /> Open Guidelines
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0 self-end sm:self-center opacity-60" disabled>
                      <Clock className="h-3.5 w-3.5" /> Guidelines coming soon
                    </Button>
                  )}
                </div>

                {/* Resource 3 */}
                <div className="p-4 rounded-lg border border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-foreground">Quality Assurance & Error Prevention Guide</h4>
                        <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                          Completed
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Common errors that cause task rejections and how to avoid clipping frame boundaries.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0 self-end sm:self-center">
                    View QA Rules <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center gap-3">
                <Checkbox
                  id="orientation-agree-check"
                  checked={orientationReviewed}
                  onCheckedChange={(checked) => setOrientationReviewed(Boolean(checked))}
                />
                <label
                  htmlFor="orientation-agree-check"
                  className="text-xs text-foreground font-medium cursor-pointer"
                >
                  I have reviewed and agree to follow the annotation guidelines and quality standards.
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2" onClick={() => setActiveTab('skills')}>
                  Next: Skills Verification <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: SKILLS */}
        <TabsContent value="skills" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <CardTitle className="font-display text-base font-semibold">Skills Check & Calibration Review</CardTitle>
                </div>
                <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                  Cleared
                </Badge>
              </div>
              <CardDescription className="text-xs">
                How contributor quality and agreement scores are measured across active projects.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <h4 className="text-xs font-semibold text-foreground">Why Quality Calibration Matters</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AI computer vision models require consistently labeled benchmark data to train effectively. Our automated calibration system continuously evaluates label accuracy against verified gold-standard frames to ensure high dataset fidelity and fair compensation for precise work.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg border border-border bg-muted/30 text-center space-y-1">
                  <Target className="h-5 w-5 text-primary mx-auto" />
                  <div className="text-xs font-bold text-foreground">Target IoU Overlap</div>
                  <div className="text-[11px] text-success font-medium">&gt; 0.85 (85%+ Precision)</div>
                  <p className="text-[10px] text-muted-foreground">Tight bounding box boundaries around target objects.</p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/30 text-center space-y-1">
                  <Layers className="h-5 w-5 text-primary mx-auto" />
                  <div className="text-xs font-bold text-foreground">Class Label Accuracy</div>
                  <div className="text-[11px] text-success font-medium">&gt; 95% Consistency</div>
                  <p className="text-[10px] text-muted-foreground">Correct taxonomy classification for multi-object scenes.</p>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/30 text-center space-y-1">
                  <TrendingUp className="h-5 w-5 text-primary mx-auto" />
                  <div className="text-xs font-bold text-foreground">Spot-Check Pass Rate</div>
                  <div className="text-[11px] text-success font-medium">&gt; 90% Approval</div>
                  <p className="text-[10px] text-muted-foreground">Fast-track approval for verified task submissions.</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2" onClick={() => setActiveTab('access')}>
                  Next: Workspace Access <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: ACCESS */}
        <TabsContent value="access" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle className="font-display text-lg font-semibold">Workspace & Studio Access</CardTitle>
                </div>
                <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                  Access Granted
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Launch the client annotation studio or claim open project tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-success/30 bg-success/10 p-5 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
                <h3 className="font-display text-base font-semibold text-foreground">
                  Ready to Annotate
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  You are fully authorized to claim task items and participate in live project pipelines for {project.title}.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {project.platform_url ? (
                  <Button
                    size="lg"
                    className="w-full sm:w-auto gap-2"
                    onClick={() => window.open(project.platform_url!, '_blank', 'noopener,noreferrer')}
                  >
                    Open Annotation Studio <ExternalLink className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="lg" className="w-full sm:w-auto gap-2 opacity-60" disabled>
                    <Clock className="h-4 w-4" /> Studio Link Coming Soon
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => navigate(`/app/task/${project.id}`)}
                >
                  Back to Project Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
