import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as jose from "https://esm.sh/jose@5.6.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function base32Decode(str: string): Uint8Array {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.toUpperCase().replace(/=/g, "");
  const bytes = new Uint8Array(Math.floor((cleaned.length * 5) / 8));
  let bits = 0, value = 0, index = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const val = ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

async function generateTotpCode(secretBase32: string, timeStepWindow = 0): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / 30) + timeStepWindow;
  const keyBytes = base32Decode(secretBase32);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: { name: "SHA-1" } },
    false,
    ["sign"]
  );

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(counter), false);

  const signature = await crypto.subtle.sign("HMAC", key, buffer);
  const sigBytes = new Uint8Array(signature);
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;

  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

async function verifyTotpCode(code: string, secretBase32: string): Promise<boolean> {
  const cleanCode = code.trim();
  for (const windowOffset of [0, -1, 1]) {
    const expected = await generateTotpCode(secretBase32, windowOffset);
    if (cleanCode === expected) return true;
  }
  return false;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.pendingToken || !body.code) {
      return new Response(JSON.stringify({ error: "Missing pendingToken or code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pendingToken = String(body.pendingToken);
    const code = String(body.code).trim();
    const jwtSecretStr = Deno.env.get("JWT_SECRET");

    if (!jwtSecretStr) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = new TextEncoder().encode(jwtSecretStr);

    // Verify pending token
    let payload: jose.JWTPayload;
    try {
      const { payload: verifiedPayload } = await jose.jwtVerify(pendingToken, secret);
      payload = verifiedPayload;
    } catch {
      return new Response(JSON.stringify({ error: "2FA session expired or invalid. Please sign in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assert purpose claim
    if (payload.purpose !== "2fa_pending") {
      return new Response(JSON.stringify({ error: "Invalid token type for 2FA verification" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileId = String(payload.sub);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Check rate limit: max 5 attempts in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("failed_2fa_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .gte("attempt_at", tenMinAgo);

    if (count !== null && count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many failed 2FA attempts. Try again in 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user_2fa
    const { data: twoFa } = await admin
      .from("user_2fa")
      .select("secret, enabled, backup_codes")
      .eq("user_id", profileId)
      .maybeSingle();

    if (!twoFa || !twoFa.enabled || !twoFa.secret) {
      return new Response(
        JSON.stringify({ error: "2FA is not enabled for this account." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try TOTP verify first
    let verified = await verifyTotpCode(code, twoFa.secret);

    // If TOTP fails, check backup codes
    if (!verified && twoFa.backup_codes && twoFa.backup_codes.length > 0) {
      const codeHash = await sha256Hex(code);
      const codeIdx = twoFa.backup_codes.indexOf(codeHash);
      if (codeIdx !== -1) {
        // Consume backup code
        const updatedBackupCodes = [...twoFa.backup_codes];
        updatedBackupCodes.splice(codeIdx, 1);
        await admin
          .from("user_2fa")
          .update({ backup_codes: updatedBackupCodes, updated_at: new Date().toISOString() })
          .eq("user_id", profileId);

        verified = true;
      }
    }

    if (!verified) {
      // Record failed attempt
      await admin.from("failed_2fa_attempts").insert({ user_id: profileId });
      return new Response(
        JSON.stringify({ error: "Invalid 2FA code or backup code." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // On success: clear failed attempts
    await admin.from("failed_2fa_attempts").delete().eq("user_id", profileId);

    // Fetch profile fresh from DB
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, email, onboarding_complete, profile_completed, display_name")
      .eq("id", profileId)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-fetch role fresh from user_roles
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .maybeSingle();

    const role = roleData?.role || "contributor";

    // Generate custom Supabase session JWT
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiration
    const sessionToken = await new jose.SignJWT({
      purpose: "session",
      role: "authenticated",
      iss: "supabase",
      aud: "authenticated",
      sub: profile.id,
      email: profile.email,
      app_role: role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(exp)
      .sign(secret);

    return new Response(
      JSON.stringify({
        token: sessionToken,
        profile,
        role,
        expiresAt: exp * 1000,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("twofa-verify-login error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
