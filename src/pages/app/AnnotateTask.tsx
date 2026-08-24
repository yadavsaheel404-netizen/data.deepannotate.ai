import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { claimWorkItem, saveAnnotationsBatch } from "@/services/taskService";
import { useIndexedDB } from "@/hooks/useIndexedDB";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Clock,
  Save,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface VideoAnnotation {
  annotation_type: string;
  frame_number: number;
  start_ms: number;
  end_ms: number;
  data: BoundingBox;
}

export default function AnnotateTask() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { saveLocal, getLocal, removeLocal, isReady: idbReady } = useIndexedDB();

  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [workItem, setWorkItem] = useState<any | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [annotations, setAnnotations] = useState<VideoAnnotation[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"synced" | "saving" | "local" | "error">("synced");

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentBoxLabel, setCurrentBoxLabel] = useState("Object");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeDragBoxRef = useRef<BoundingBox | null>(null);

  // 1. Claim work item and initialize
  useEffect(() => {
    if (!taskId) return;

    const startSession = async () => {
      setLoading(true);
      try {
        setClaiming(true);
        // Invoke database concurrent claim RPC
        const workItemId = await claimWorkItem(taskId);
        setClaiming(false);

        // Fetch claimed work item details
        const { data: itemData, error: itemErr } = await supabase
          .from("work_items")
          .select("*, videos(*)")
          .eq("id", workItemId)
          .single();

        if (itemErr || !itemData) throw new Error("Failed to fetch work item details");

        setWorkItem(itemData);

        // Retrieve video signed URL
        const { data: signedData, error: signedErr } = await supabase.storage
          .from("submissions")
          .createSignedUrl(itemData.videos.storage_path, 3600);

        if (signedErr || !signedData?.signedUrl) {
          throw new Error("Failed to secure signed video URL");
        }

        setVideoUrl(signedData.signedUrl);

        // Load database annotations if any exist
        const { data: dbAnns } = await supabase
          .from("annotations")
          .select("*")
          .eq("work_item_id", workItemId);

        let initialAnns: VideoAnnotation[] = [];
        if (dbAnns && dbAnns.length > 0) {
          initialAnns = dbAnns.map((a: any) => ({
            annotation_type: a.annotation_type,
            frame_number: a.frame_number,
            start_ms: a.start_ms,
            end_ms: a.end_ms,
            data: a.data as BoundingBox,
          }));
          const maxVersion = Math.max(...dbAnns.map((a: any) => a.version));
          setVersion(maxVersion);
        }

        // Check IndexedDB local backup for recovery
        if (idbReady) {
          const localDraft = await getLocal(workItemId);
          if (localDraft && localDraft.annotations.length > 0) {
            setAnnotations(localDraft.annotations);
            setVersion(localDraft.version);
            setAutosaveStatus("local");
            toast.info("Restored uncommitted work from local crash backup.");
          } else {
            setAnnotations(initialAnns);
          }
        } else {
          setAnnotations(initialAnns);
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "No segments available or claim failed.");
        navigate("/app", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    startSession();
  }, [taskId, navigate, idbReady]);

  // 2. Autosave timer (2-second debounced save loop)
  useEffect(() => {
    if (!workItem || loading) return;

    const delayDebounce = setTimeout(async () => {
      setIsAutosaving(true);
      setAutosaveStatus("saving");
      try {
        // Save backup to IndexedDB
        if (idbReady) {
          await saveLocal(workItem.id, { annotations, version });
        }

        // Flush batch changes to PostgreSQL RPC
        const result = await saveAnnotationsBatch(workItem.id, version, annotations);

        if (result.success) {
          setVersion(result.current_version);
          setAutosaveStatus("synced");
        } else {
          // Version conflict occurred! Force client resolution.
          setAutosaveStatus("error");
          toast.warning("Version conflict: Another save exists. Reloading newer annotations.");
          const mergedAnns = result.db_annotations.map((a: any) => ({
            annotation_type: a.annotation_type,
            frame_number: a.frame_number,
            start_ms: a.start_ms,
            end_ms: a.end_ms,
            data: a.data as BoundingBox,
          }));
          setAnnotations(mergedAnns);
          setVersion(result.current_version);
        }
      } catch (err: any) {
        console.error("Autosave failed:", err);
        setAutosaveStatus("local"); // Keep changes locally in IndexedDB
      } finally {
        setIsAutosaving(false);
      }
    }, 2000);

    return () => clearTimeout(delayDebounce);
  }, [annotations, workItem, loading, idbReady]);

  // 3. Canvas rendering for overlays
  const drawCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas dimensions to video display size
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing annotations for current frame (or current segment time)
    const currentMs = video.currentTime * 1000;
    const activeAnnotations = annotations.filter(
      (ann) => currentMs >= ann.start_ms && currentMs <= ann.end_ms
    );

    ctx.lineWidth = 2;
    ctx.font = "12px sans-serif";

    activeAnnotations.forEach((ann) => {
      const box = ann.data;
      const rx = box.x * canvas.width;
      const ry = box.y * canvas.height;
      const rw = box.width * canvas.width;
      const rh = box.height * canvas.height;

      // Draw bounding box
      ctx.strokeStyle = "#ff3b30";
      ctx.strokeRect(rx, ry, rw, rh);

      // Draw label badge
      ctx.fillStyle = "#ff3b30";
      const txtWidth = ctx.measureText(box.label).width;
      ctx.fillRect(rx, ry - 18, txtWidth + 10, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(box.label, rx + 5, ry - 5);
    });

    // Draw active drag box if dragging
    if (activeDragBoxRef.current) {
      const box = activeDragBoxRef.current;
      const rx = box.x * canvas.width;
      const ry = box.y * canvas.height;
      const rw = box.width * canvas.width;
      const rh = box.height * canvas.height;

      ctx.strokeStyle = "#34c759";
      ctx.strokeRect(rx, ry, rw, rh);

      ctx.fillStyle = "#34c759";
      ctx.fillRect(rx, ry - 18, 50, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("New", rx + 5, ry - 5);
    }
  };

  useEffect(() => {
    drawCanvas();
  }, [annotations, currentTime]);

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !workItem) return;

    const currentMs = video.currentTime * 1000;

    // Enforce segment playback boundaries
    if (currentMs < workItem.segment_start_ms) {
      video.currentTime = workItem.segment_start_ms / 1000;
    }
    if (currentMs > workItem.segment_end_ms) {
      video.pause();
      setIsPlaying(false);
      video.currentTime = workItem.segment_start_ms / 1000;
    }

    setCurrentTime(video.currentTime);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;

    dragStartRef.current = { x, y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / canvas.width;
    const currentY = (e.clientY - rect.top) / canvas.height;

    const x = Math.min(dragStartRef.current.x, currentX);
    const y = Math.min(dragStartRef.current.y, currentY);
    const width = Math.abs(dragStartRef.current.x - currentX);
    const height = Math.abs(dragStartRef.current.y - currentY);

    activeDragBoxRef.current = { x, y, width, height, label: currentBoxLabel };
    drawCanvas();
  };

  const handleCanvasMouseUp = () => {
    if (!dragStartRef.current || !activeDragBoxRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const currentMs = Math.round(video.currentTime * 1000);
    const frame = Math.round(video.currentTime * 30); // Approximate 30fps

    const newAnnotation: VideoAnnotation = {
      annotation_type: workItem.required_annotation_type,
      frame_number: frame,
      start_ms: currentMs - 500 < workItem.segment_start_ms ? workItem.segment_start_ms : currentMs - 500,
      end_ms: currentMs + 500 > workItem.segment_end_ms ? workItem.segment_end_ms : currentMs + 500,
      data: activeDragBoxRef.current,
    };

    setAnnotations((prev) => [...prev, newAnnotation]);
    dragStartRef.current = null;
    activeDragBoxRef.current = null;
    drawCanvas();
  };

  const deleteAnnotation = (index: number) => {
    setAnnotations((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlaybackToggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const frameStep = (direction: "prev" | "next") => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const fps = 30;
    const delta = direction === "next" ? 1 / fps : -1 / fps;
    video.currentTime = Math.max(0, video.currentTime + delta);
  };

  const handleSubmit = async () => {
    if (!workItem) return;
    setLoading(true);
    try {
      // 1. Mark claim as completed and work item as completed
      const { error: claimErr } = await supabase
        .from("work_claims")
        .update({ status: "completed" })
        .eq("work_item_id", workItem.id)
        .eq("status", "active");

      if (claimErr) throw claimErr;

      const { error: itemErr } = await supabase
        .from("work_items")
        .update({ status: "completed" })
        .eq("id", workItem.id);

      if (itemErr) throw itemErr;

      // 2. Clear IndexedDB local draft
      if (idbReady) {
        await removeLocal(workItem.id);
      }

      toast.success("Annotations submitted successfully!");
      navigate("/app/tasks");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit work item.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center space-y-4">
          <Skeleton className="h-8 w-48 mx-auto bg-zinc-800" />
          <Skeleton className="h-64 w-[600px] bg-zinc-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!workItem) return null;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Bar Header */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/tasks")} className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display font-bold">Video Clip Annotation</span>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
            Segment: {Math.round(workItem.segment_start_ms / 1000)}s - {Math.round(workItem.segment_end_ms / 1000)}s
          </Badge>
        </div>

        {/* Autosave Status Indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs">
            {autosaveStatus === "synced" && (
              <span className="text-emerald-500 inline-flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Synced to cloud
              </span>
            )}
            {autosaveStatus === "saving" && (
              <span className="text-zinc-400 animate-pulse inline-flex items-center gap-1">
                <Save className="h-3.5 w-3.5" /> Saving changes...
              </span>
            )}
            {autosaveStatus === "local" && (
              <span className="text-amber-500 inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Local draft (offline)
              </span>
            )}
            {autosaveStatus === "error" && (
              <span className="text-rose-500 inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Collision conflict resolved
              </span>
            )}
          </div>

          <Button variant="hero" className="bg-emerald-600 hover:bg-emerald-500" onClick={handleSubmit}>
            Submit Work
          </Button>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Left Column: Video and Canvas Player */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-black flex-1 flex items-center justify-center">
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setDuration(videoRef.current.duration);
                    videoRef.current.currentTime = workItem.segment_start_ms / 1000;
                  }
                }}
                className="w-full max-h-[60vh] object-contain"
              />
            )}
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className="absolute inset-0 w-full h-full cursor-crosshair z-10"
            />
          </div>

          {/* Video Controls Panel */}
          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-4 gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => frameStep("prev")} className="text-zinc-300">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button variant="secondary" size="icon" onClick={handlePlaybackToggle} className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => frameStep("next")} className="text-zinc-300">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Timeline track bar */}
            <div className="flex-1 flex items-center gap-3 text-xs text-zinc-400">
              <span>{Math.round(currentTime * 10) / 10}s</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden relative">
                <div
                  style={{
                    left: `${(workItem.segment_start_ms / (duration * 1000)) * 100}%`,
                    width: `${((workItem.segment_end_ms - workItem.segment_start_ms) / (duration * 1000)) * 100}%`,
                  }}
                  className="absolute top-0 bottom-0 bg-zinc-700/50"
                />
                <div
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                  className="absolute top-0 bottom-0 w-1 bg-emerald-500 rounded-full"
                />
              </div>
              <span>{Math.round(duration * 10) / 10}s</span>
            </div>
          </div>
        </div>

        {/* Right Column: Annotation Label List and Tools */}
        <div className="w-80 flex flex-col gap-4">
          <Card className="bg-zinc-900 border-zinc-800 text-zinc-100 flex-1 flex flex-col">
            <CardContent className="p-5 flex-1 flex flex-col gap-4 overflow-hidden">
              <h2 className="font-display text-base font-semibold border-b border-zinc-800 pb-3 flex items-center justify-between">
                <span>Annotations</span>
                <Badge className="bg-zinc-800 text-zinc-300">{annotations.length}</Badge>
              </h2>

              {/* Label configuration input */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium">Draw Object Label</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentBoxLabel}
                    onChange={(e) => setCurrentBoxLabel(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-sm outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              {/* Annotation labels list scrolling panel */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {annotations.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-4">
                    <p className="text-xs">No bounding boxes drawn yet.</p>
                    <p className="text-[10px] mt-1">Click and drag inside the video viewport to overlay a bounding box at the current time.</p>
                  </div>
                ) : (
                  annotations.map((ann, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-medium text-zinc-200 truncate">{ann.data.label}</span>
                        <span className="text-[10px] text-zinc-500">
                          Time: {Math.round(ann.start_ms / 100) / 10}s - {Math.round(ann.end_ms / 100) / 10}s (Frame: {ann.frame_number})
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteAnnotation(idx)} className="text-zinc-500 hover:text-rose-500 h-7 w-7">
                        <Trash2 className="h-4.5 w-4.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
