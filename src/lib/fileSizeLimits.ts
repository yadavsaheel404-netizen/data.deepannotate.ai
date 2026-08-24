import type { MediaType } from '@/types/project';

export const DEFAULT_SIZE_LIMITS_MB: Record<Exclude<MediaType, 'text'>, number> = {
  image: 10,
  video: 100,
  audio: 50,
};

export const ACCEPTED_FORMATS: Record<Exclude<MediaType, 'text'>, string> = {
  image: 'JPG, PNG, WebP',
  video: 'MP4, MOV, WebM',
  audio: 'MP3, WAV, M4A',
};

/** Strict allowed MIME types per media type (no wildcards). */
export const ALLOWED_MIME_TYPES: Record<Exclude<MediaType, 'text'>, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a'],
};

/** Strict allowed file extensions per media type (lowercase, with dot). */
export const ALLOWED_EXTENSIONS: Record<Exclude<MediaType, 'text'>, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.webp'],
  video: ['.mp4', '.mov', '.webm'],
  audio: ['.mp3', '.wav', '.m4a'],
};

/** HTML input accept attribute string (extensions + MIME types) per media type. */
export const ACCEPT_ATTRIBUTE: Record<Exclude<MediaType, 'text'>, string> = {
  image: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  video: '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm',
  audio: '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4',
};

/** Validate a file strictly by MIME type AND extension. */
export function validateFileType(
  file: File,
  mediaType: Exclude<MediaType, 'text'>
): { ok: true } | { ok: false; error: string } {
  const allowedMimes = ALLOWED_MIME_TYPES[mediaType];
  const allowedExts = ALLOWED_EXTENSIONS[mediaType];
  const formatsLabel = ACCEPTED_FORMATS[mediaType];

  const lowerName = file.name.toLowerCase();
  const lastDot = lowerName.lastIndexOf('.');
  const ext = lastDot >= 0 ? lowerName.slice(lastDot) : '';

  const extOk = allowedExts.includes(ext);
  const mimeOk = !!file.type && allowedMimes.includes(file.type.toLowerCase());

  // Require BOTH extension and MIME type to match — prevents spoofing
  // (renamed extensions or mismatched MIME types are rejected).
  if (!extOk || !mimeOk) {
    return {
      ok: false,
      error: `Invalid file type. Only ${formatsLabel} are permitted.`,
    };
  }
  return { ok: true };
}

/** Returns the effective max upload size in MB for a project. */
export function getMaxFileSizeMB(
  mediaType: MediaType,
  customLimitMb?: number | null
): number {
  if (mediaType === 'text') return 0;
  if (customLimitMb && customLimitMb > 0) return customLimitMb;
  return DEFAULT_SIZE_LIMITS_MB[mediaType];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
