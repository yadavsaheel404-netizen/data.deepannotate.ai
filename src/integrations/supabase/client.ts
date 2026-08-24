import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let currentToken: string | null = null;

/** Updates the active JWT used for authorizing direct Supabase PostgreSQL and Storage requests. */
export function setSupabaseToken(token: string | null) {
  currentToken = token;
}

const customFetch = async (url: any, options: any = {}) => {
  const headers = new Headers(options.headers);
  
  // Ensure the project's apikey header is always present
  if (SUPABASE_PUBLISHABLE_KEY && !headers.has("apikey")) {
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  }

  // Inject or override the authorization bearer token
  if (currentToken) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  } else if (SUPABASE_PUBLISHABLE_KEY && !headers.has("Authorization")) {
    // Fall back to the public anon token if no custom authenticated token is present
    headers.set("Authorization", `Bearer ${SUPABASE_PUBLISHABLE_KEY}`);
  }

  return fetch(url, { ...options, headers });
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
  },
});