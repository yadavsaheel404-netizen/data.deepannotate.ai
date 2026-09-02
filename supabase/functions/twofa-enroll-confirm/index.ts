import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { verifyFirebaseIdToken } from "../_shared/firebaseAuth.ts";

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

function generateBackupCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.idToken || !body.code) {
      return new Response(JSON.stringify({ error: "Missing idToken or code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idToken = String(body.idToken);
    const code = String(body.code).trim();

    let authUser;
    try {
      authUser = await verifyFirebaseIdToken(idToken);
    } catch (verifyErr) {
      const errMsg = (verifyErr as Error).message || String(verifyErr);
      return new Response(JSON.stringify({ error: "Invalid ID Token", details: errMsg }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUid = authUser.uid;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Look up profile
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check rate limit: max 5 attempts in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("failed_2fa_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("attempt_at", tenMinAgo);

    if (count !== null && count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Try again in 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user_2fa
    const { data: twoFa } = await admin
      .from("user_2fa")
      .select("secret, enabled")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!twoFa || !twoFa.secret) {
      return new Response(
        JSON.stringify({ error: "No pending 2FA enrollment found. Please start enrollment first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify code via Web Crypto
    const isCodeValid = await verifyTotpCode(code, twoFa.secret);
    if (!isCodeValid) {
      // Record failed attempt
      await admin.from("failed_2fa_attempts").insert({ user_id: profile.id });
      return new Response(
        JSON.stringify({ error: "Invalid verification code. Please check your authenticator app." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // On success: generate 10 backup codes
    const plaintextBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const codeStr = generateBackupCode();
      plaintextBackupCodes.push(codeStr);
      const hash = await sha256Hex(codeStr);
      hashedBackupCodes.push(hash);
    }

    // Update user_2fa: set enabled = true, store backup code hashes
    const { error: updateErr } = await admin
      .from("user_2fa")
      .update({
        enabled: true,
        backup_codes: hashedBackupCodes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", profile.id);

    if (updateErr) throw updateErr;

    // Update profiles table
    await admin
      .from("profiles")
      .update({ two_factor_enabled: true } as any)
      .eq("id", profile.id);

    // Clear failed attempts
    await admin.from("failed_2fa_attempts").delete().eq("user_id", profile.id);

    return new Response(
      JSON.stringify({ success: true, backupCodes: plaintextBackupCodes }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    console.error("twofa-enroll-confirm error:", errMsg);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
