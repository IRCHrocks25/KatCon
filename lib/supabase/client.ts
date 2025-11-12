import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { robustFetch } from "@/lib/utils/fetch";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file"
  );
}

// Create a single, centralized Supabase client instance
// Configured for optimal session persistence and auth handling
// Uses custom fetch with connection management to prevent stale connection issues
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // We handle auth state manually
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "supabase.auth.token",
    flowType: "pkce", // Use PKCE flow for better security
  },
  global: {
    // Use robustFetch for ALL Supabase network requests
    // This prevents HTTP connection pooling issues that cause intermittent failures
    fetch: robustFetch as unknown as typeof fetch,
  },
});

