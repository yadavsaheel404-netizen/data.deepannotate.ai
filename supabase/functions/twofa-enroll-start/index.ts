import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { verifyFirebaseIdToken } from "../_shared/firebaseAuth.ts";

// Generate 20-byte (160-bit) TOTP secret using Deno's built-in Web Crypto API (CSPRNG)
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
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
    if (!body || typeof body !== "object" || !body.idToken) {
      return new Response(JSON.stringify({ error: "Missing idToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idToken = String(body.idToken);
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
    const email = authUser.email;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Look up profile by firebase_uid
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, email")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (profileErr) {
      console.error("Profile query error:", profileErr);
      throw profileErr;
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: check if 2FA is already enabled for this profile
    const { data: existing, error: existingErr } = await admin
      .from("user_2fa")
      .select("enabled")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (existingErr) {
      console.error("user_2fa query error:", existingErr);
      throw existingErr;
    }

    if (existing?.enabled === true) {
      return new Response(
        JSON.stringify({ error: "2FA is already enabled. Disable it first to re-enroll." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate fresh secret via Deno CSPRNG
    const secret = generateTotpSecret();

    // Upsert user_2fa (enabled: false until confirmed)
    const { error: upsertErr } = await admin.from("user_2fa").upsert({
      user_id: profile.id,
      secret,
      enabled: false,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error("user_2fa upsert error:", upsertErr);
      throw upsertErr;
    }

    const uri = `otpauth://totp/DeepAnnotate.ai:${encodeURIComponent(email)}?secret=${secret}&issuer=DeepAnnotate.ai`;

    return new Response(
      JSON.stringify({ uri, secret }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    console.error("twofa-enroll-start error:", errMsg);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
