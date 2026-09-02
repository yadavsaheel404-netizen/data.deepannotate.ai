import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as jose from "https://esm.sh/jose@5.6.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function logJson(level: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    function_name: "firebase-auth",
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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.idToken) {
      return new Response(JSON.stringify({ error: "Missing idToken" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idToken = String(body.idToken);
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    if (!firebaseProjectId) {
      logJson("error", { error: "FIREBASE_PROJECT_ID env variable is not configured" });
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Firebase JWT using Google JWKS endpoint
    const JWKS = jose.createRemoteJWKSet(
      new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
    );

    let payload: jose.JWTPayload;
    try {
      const { payload: verifiedPayload } = await jose.jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId,
      });
      payload = verifiedPayload;
    } catch (verifyErr) {
      const errMsg = (verifyErr as Error).message || String(verifyErr);
      let decodedInfo = "";
      try {
        const decoded = jose.decodeJwt(idToken);
        decodedInfo = ` (token iss: ${decoded.iss}, aud: ${decoded.aud}, expected: ${firebaseProjectId})`;
      } catch {
        decodedInfo = " (failed to decode token)";
      }
      logJson("warn", { error: "JWT verification failed", message: errMsg + decodedInfo });
      return new Response(JSON.stringify({ error: "Invalid ID Token", details: errMsg + decodedInfo }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUid = payload.sub; // Firebase user ID
    const email = payload.email ? String(payload.email) : null;
    const name = payload.name ? String(payload.name) : null;
    const phone = payload.phone_number ? String(payload.phone_number) : null;

    if (!firebaseUid) {
      return new Response(JSON.stringify({ error: "Invalid token payload: missing sub claim" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecretStr = Deno.env.get("JWT_SECRET")!;

    // Create Supabase Admin client to bypass RLS policies and retrieve/insert profiles
    const admin = createClient(supabaseUrl, serviceKey);

    let profile: any = null;
    let role: string = "contributor";

    // 1. Check if user already exists by firebase_uid
    const { data: existingByUid, error: uidErr } = await admin
      .from("profiles")
      .select("id, email, onboarding_complete, profile_completed, display_name")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (uidErr) {
      logJson("error", { error: "Database error lookup by firebase_uid", message: uidErr.message });
      throw uidErr;
    }

    if (existingByUid) {
      profile = existingByUid;
    } else if (email) {
      // 2. Map existing user by email to prevent duplicate accounts
      const { data: existingByEmail, error: emailErr } = await admin
        .from("profiles")
        .select("id, email, onboarding_complete, profile_completed, display_name")
        .eq("email", email)
        .maybeSingle();

      if (emailErr) {
        logJson("error", { error: "Database error lookup by email", message: emailErr.message });
        throw emailErr;
      }

      if (existingByEmail) {
        // Link Firebase UID to existing profile
        const { data: updatedProfile, error: updateErr } = await admin
          .from("profiles")
          .update({ firebase_uid: firebaseUid } as any)
          .eq("id", existingByEmail.id)
          .select("id, email, onboarding_complete, profile_completed, display_name")
          .single();

        if (updateErr) {
          logJson("error", { error: "Database error updating firebase_uid", message: updateErr.message });
          throw updateErr;
        }
        profile = updatedProfile;
        logJson("info", { event: "linked_user_profile", email, firebase_uid: firebaseUid });
      }
    }

    // 3. Create a brand new user profile if none exists
    if (!profile) {
      const newProfileId = crypto.randomUUID();
      const { data: newProfile, error: insertErr } = await admin
        .from("profiles")
        .insert({
          id: newProfileId,
          firebase_uid: firebaseUid,
          email: email,
          display_name: name || email || "User",
          phone: phone,
          onboarding_complete: false,
          profile_completed: false,
        } as any)
        .select("id, email, onboarding_complete, profile_completed, display_name")
        .single();

      if (insertErr) {
        logJson("error", { error: "Database error inserting profile", message: insertErr.message });
        throw insertErr;
      }

      // Assign default contributor role
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: newProfileId, role: "contributor" } as any);

      if (roleErr) {
        logJson("error", { error: "Database error inserting default role", message: roleErr.message });
        throw roleErr;
      }

      profile = newProfile;
      role = "contributor";
      logJson("info", { event: "created_user_profile", email, firebase_uid: firebaseUid, profile_id: newProfileId });
    } else {
      // Look up current role from user_roles
      const { data: roleData, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (roleErr) {
        logJson("error", { error: "Database error fetching user role", message: roleErr.message });
        throw roleErr;
      }
      role = roleData?.role || "contributor";
    }

    // Check 2FA status
    const { data: twoFa } = await admin
      .from("user_2fa")
      .select("enabled")
      .eq("user_id", profile.id)
      .maybeSingle();

    const secret = new TextEncoder().encode(jwtSecretStr);

    if (twoFa?.enabled) {
      // Issue short-lived PENDING token (5 min) — NOT a session token
      // role: 'anon' ensures PostgREST grants zero authenticated access
      // app_role omitted to avoid role disclosure
      const pendingToken = await new jose.SignJWT({
        purpose: "2fa_pending",
        role: "anon",
        sub: profile.id,
        email: profile.email,
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime("5m")
        .sign(secret);

      logJson("info", { event: "2fa_required", user_id: profile.id });

      return new Response(
        JSON.stringify({
          requires2fa: true,
          pendingToken,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Generate custom Supabase JWT containing profiles.id as sub claim
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiration

    const customToken = await new jose.SignJWT({
      purpose: "session",
      role: "authenticated",
      iss: "supabase",
      aud: "authenticated",
      sub: profile.id, // Profile ID UUID
      email: profile.email,
      app_role: role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(exp)
      .sign(secret);

    logJson("info", { event: "jwt_signed", user_id: profile.id, role });

    return new Response(
      JSON.stringify({
        token: customToken,
        profile,
        role,
        expiresAt: exp * 1000,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    logJson("error", { error: "UNCAUGHT_EXCEPTION", message: (err as Error).message });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
