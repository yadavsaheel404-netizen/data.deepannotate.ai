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
import type { AppRole, UserProfile } from "@/types/user";

interface AuthState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  initialized: boolean;

  // 2FA pending state
  twoFactorPending: boolean;
  pendingToken: string | null;

  initialize: () => Promise<void>;
  completeTwoFactor: (code: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<FirebaseUser>;
  signUp: (email: string, password: string, displayName: string, currentStatus?: string) => Promise<{ user: any; session: any } | void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  fetchRole: (userId: string) => Promise<void>;
}

let authListenerUnsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  role: null,
  loading: true,
  initialized: false,
  twoFactorPending: false,
  pendingToken: null,

  initialize: async () => {
    if (authListenerUnsubscribe) {
      return;
    }

    authListenerUnsubscribe = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) {
        setSupabaseToken(null);
        set({
          user: null,
          profile: null,
          role: null,
          twoFactorPending: false,
          pendingToken: null,
          loading: false,
          initialized: true,
        });
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
        set({
          user: null,
          profile: null,
          role: null,
          twoFactorPending: false,
          pendingToken: null,
          loading: false,
          initialized: true,
        });
        return;
      }

      set({ user: fbUser, loading: true });

      try {
        // Obtain Firebase ID token (works for email/password and Google users)
        const idToken = await fbUser.getIdToken();

        // Call the server-side firebase-auth Edge Function (THE ONLY JWT ISSUER)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const res = await fetch(`${supabaseUrl}/functions/v1/firebase-auth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ idToken }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const detailStr = errData.details ? `: ${errData.details}` : "";
          throw new Error((errData.error || `firebase-auth returned status ${res.status}`) + detailStr);
        }

        const data = await res.json();

        if (data.requires2fa) {
          // User has 2FA enabled: enter twoFactorPending state
          // No session JWT is set yet, no access granted
          set({
            twoFactorPending: true,
            pendingToken: data.pendingToken,
            profile: null,
            role: null,
            loading: false,
            initialized: true,
          });
          return;
        }

        // Non-2FA user (or 2FA not enabled): full session JWT issued by server
        setSupabaseToken(data.token);
        set({
          profile: data.profile as UserProfile,
          role: data.role as AppRole,
          twoFactorPending: false,
          pendingToken: null,
          loading: false,
          initialized: true,
        });
      } catch (err) {
        console.error("Auth initialization failed:", err);
        setSupabaseToken(null);
        set({
          user: null,
          profile: null,
          role: null,
          twoFactorPending: false,
          pendingToken: null,
          loading: false,
          initialized: true,
        });
      }
    });
  },

  completeTwoFactor: async (code: string) => {
    const { pendingToken } = get();
    if (!pendingToken) {
      throw new Error("No pending 2FA verification token found. Please sign in again.");
    }

    set({ loading: true });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/twofa-verify-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ pendingToken, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Invalid 2FA code");
      }

      setSupabaseToken(data.token);
      set({
        profile: data.profile as UserProfile,
        role: data.role as AppRole,
        twoFactorPending: false,
        pendingToken: null,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
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

      set({
        user: null,
        profile: null,
        role: null,
        twoFactorPending: false,
        pendingToken: null,
        loading: false,
      });
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
      set({
        user: null,
        profile: null,
        role: null,
        twoFactorPending: false,
        pendingToken: null,
        loading: false,
      });
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
