import { create } from "zustand";
import { supabase, setSupabaseToken } from "@/integrations/supabase/client";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as signOutFirebase,
  onIdTokenChanged,
  updateProfile,
  sendEmailVerification,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth, googleAuthProvider } from "@/lib/firebase";
import { signSupabaseToken } from "@/lib/jwt";
import type { AppRole, UserProfile } from "@/types/user";

interface AuthState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<FirebaseUser>;
  signUp: (email: string, password: string, displayName: string, currentStatus?: string) => Promise<{ user: any; session: any } | void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  fetchRole: (userId: string) => Promise<void>;
}

async function signToken(sub: string, email: string | null, role: string) {
  const jwtSecret = import.meta.env.VITE_SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.warn("⚠️ VITE_SUPABASE_JWT_SECRET missing — queries will be anonymous.");
    return null;
  }
  const token = await signSupabaseToken(
    {
      role: "authenticated",
      iss: "supabase",
      aud: "authenticated",
      sub,
      email,
      app_role: role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    jwtSecret
  );
  setSupabaseToken(token);
  return token;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  role: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) {
        setSupabaseToken(null);
        set({ user: null, profile: null, role: null, loading: false, initialized: true });
        return;
      }

      // Email Verification Gate:
      // Google-authenticated accounts are pre-verified by Google.
      // Email/password accounts MUST have emailVerified === true.
      const isGoogleUser = fbUser.providerData.some((p) => p.providerId === "google.com");
      if (!isGoogleUser && !fbUser.emailVerified) {
        console.warn("⚠️ Email not verified — blocking session initialization.");
        await signOutFirebase(firebaseAuth);
        setSupabaseToken(null);
        set({ user: null, profile: null, role: null, loading: false, initialized: true });
        return;
      }

      set({ user: fbUser, loading: true });

      try {
        // Step 1: Generate a temporary profile UUID and sign a JWT with it.
        // We use this to authenticate the RPC call that will create/fetch the profile.
        // The RPC (upsert_firebase_profile) is SECURITY DEFINER so it bypasses RLS.
        const tempId = crypto.randomUUID();
        await signToken(tempId, fbUser.email, "contributor");

        // Step 2: Call the SECURITY DEFINER RPC to upsert the profile.
        // This handles both new users (INSERT) and returning users (UPDATE on conflict).
        // It never hits the RLS INSERT policy because SECURITY DEFINER runs as postgres.
        const { data: profile, error: rpcErr } = await supabase.rpc(
          "upsert_firebase_profile",
          {
            p_id: tempId,
            p_firebase_uid: fbUser.uid,
            p_email: fbUser.email ?? "",
            p_display_name: fbUser.displayName || fbUser.email || "User",
          }
        );

        if (rpcErr) throw rpcErr;

        const profileId = (profile as any).id;

        // Step 3: Sign JWT with the REAL profile ID so auth.uid() = profileId
        // satisfies RLS policy for the user_roles query.
        await signToken(profileId, fbUser.email, "contributor");

        // Step 4: Fetch the role(s) for this user.
        // Select array instead of maybeSingle() to prevent PostgREST PGRST116 errors
        // if duplicate role rows exist. If 'admin' is assigned, prioritize 'admin'.
        const { data: rolesData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profileId);

        if (roleError) {
          console.error("Critical error querying user_roles for user:", profileId, roleError);
        }

        const rolesList = (rolesData || []).map((r) => r.role);
        const finalRole: AppRole = rolesList.includes("admin")
          ? "admin"
          : (rolesList[0] as AppRole) || "contributor";

        // Step 5: Re-sign the JWT with the REAL profile ID and verified finalRole.
        await signToken(profileId, fbUser.email, finalRole);

        set({
          profile: profile as UserProfile,
          role: finalRole,
          loading: false,
          initialized: true,
        });
      } catch (err) {
        console.error("Auth initialization failed:", err);
        setSupabaseToken(null);
        set({ user: null, profile: null, role: null, loading: false, initialized: true });
      }
    });
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true });
    try {
      const userCred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      return userCred.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signUp: async (email, password, displayName) => {
    set({ loading: true });
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(fbUser, { displayName });

      const actionCodeSettings = {
        url: `${window.location.origin}/auth/login?verified=true`,
        handleCodeInApp: false,
      };
      await sendEmailVerification(fbUser, actionCodeSettings);

      // Immediately sign out to prevent auto-login before email verification
      await signOutFirebase(firebaseAuth);
      setSupabaseToken(null);

      set({ user: null, profile: null, role: null, loading: false });
      return { user: fbUser, session: null };
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true });
    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await signOutFirebase(firebaseAuth);
      setSupabaseToken(null);
    } catch (error) {
      console.error("Sign-out failed:", error);
    } finally {
      set({ loading: false });
    }
  },

  fetchProfile: async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) set({ profile: data as unknown as UserProfile });
  },

  fetchRole: async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (data) set({ role: data.role as AppRole });
  },
}));
