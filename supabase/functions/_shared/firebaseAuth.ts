import * as jose from "https://esm.sh/jose@5.6.3";

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const JWKS = jose.createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  payload: jose.JWTPayload;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!firebaseProjectId) {
    throw new Error("Server misconfiguration: FIREBASE_PROJECT_ID missing");
  }

  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    audience: firebaseProjectId,
  });

  const uid = payload.sub;
  if (!uid) {
    throw new Error("Invalid ID Token: missing sub claim");
  }

  const email = payload.email ? String(payload.email) : "user@deepannotate.ai";

  return {
    uid,
    email,
    payload,
  };
}
