import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_MIME: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: [
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave",
    "audio/mp4", "audio/x-m4a",
  ],
};

const ALLOWED_EXT: Record<string, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp"],
  video: [".mp4", ".mov", ".webm"],
  audio: [".mp3", ".wav", ".m4a"],
};

const DEFAULT_LIMIT_MB: Record<string, number> = {
  image: 10,
  video: 100,
  audio: 50,
};

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : "";
  const cleanBase = base.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  return `${cleanBase}${cleanExt}`;
}

function logJson(level: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    function_name: "validate-upload",
    timestamp: new Date().toISOString(),
    ...payload,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectId = String(body.project_id ?? "");
    const fileName = String(body.file_name ?? "");
    const fileSize = Number(body.file_size);
    const mimeType = String(body.mime_type ?? "").toLowerCase();

    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return new Response(JSON.stringify({ error: "Invalid project_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fileName || fileName.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid file_name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return new Response(JSON.stringify({ error: "Invalid file_size" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up project + media_type + size limit
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("id, media_type, max_file_size_mb, status")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !project) {
      logJson("error", { user_id: userId, error: "PROJECT_NOT_FOUND", project_id: projectId });
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.status !== "active") {
      return new Response(JSON.stringify({ error: "Project is not accepting submissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaType = project.media_type as string;
    if (!ALLOWED_MIME[mediaType]) {
      return new Response(JSON.stringify({ error: "This project does not accept file uploads" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MIME validation
    if (!ALLOWED_MIME[mediaType].includes(mimeType)) {
      logJson("warn", { user_id: userId, error: "INVALID_MIME", mime_type: mimeType, media_type: mediaType });
      return new Response(JSON.stringify({ error: `Invalid MIME type for ${mediaType}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extension validation
    const lowerName = fileName.toLowerCase();
    const dotIdx = lowerName.lastIndexOf(".");
    const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : "";
    if (!ALLOWED_EXT[mediaType].includes(ext)) {
      return new Response(JSON.stringify({ error: `Invalid file extension for ${mediaType}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Size validation
    const maxMb = project.max_file_size_mb && project.max_file_size_mb > 0
      ? project.max_file_size_mb
      : DEFAULT_LIMIT_MB[mediaType];
    const maxBytes = maxMb * 1024 * 1024;
    if (fileSize > maxBytes) {
      logJson("warn", { user_id: userId, error: "FILE_TOO_LARGE", file_size: fileSize, max_bytes: maxBytes });
      return new Response(JSON.stringify({
        error: `File too large. Max ${maxMb} MB.`,
      }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build path: projectId/userId/submissionUuid/timestamp_filename
    const submissionUuid = crypto.randomUUID();
    const safeName = `${Date.now()}_${sanitizeFileName(fileName)}`;
    const path = `${projectId}/${userId}/${submissionUuid}/${safeName}`;

    const { data: signed, error: signErr } = await admin.storage
      .from("submissions")
      .createSignedUploadUrl(path);

    if (signErr || !signed) {
      logJson("error", { user_id: userId, error: "SIGN_URL_FAILED", message: signErr?.message });
      return new Response(JSON.stringify({ error: "Failed to create upload URL" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logJson("info", {
      user_id: userId,
      project_id: projectId,
      media_type: mediaType,
      file_size: fileSize,
      mime_type: mimeType,
    });

    return new Response(JSON.stringify({
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    logJson("error", { error: "UNCAUGHT", message: (err as Error).message });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
