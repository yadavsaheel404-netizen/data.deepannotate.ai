// Native Web Crypto implementation of HMAC-SHA256 JWT signing
// Avoids external library dependencies and bundle bloat

function base64UrlEncode(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signHmacSha256(
  header: string,
  payload: string,
  secretStr: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretStr);

  const key = await window.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  const dataToSign = encoder.encode(`${header}.${payload}`);
  const signature = await window.crypto.subtle.sign("HMAC", key, dataToSign);

  return arrayBufferToBase64Url(signature);
}

/** Signs a custom claims payload to authorize direct Supabase PostgreSQL queries via RLS. */
export async function signSupabaseToken(
  payload: Record<string, any>,
  secretStr: string
): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signHmacSha256(encodedHeader, encodedPayload, secretStr);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
