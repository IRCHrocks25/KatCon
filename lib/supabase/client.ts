import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getLocalStorage } from "@/lib/utils/storage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file"
  );
}

// Create a single, centralized Supabase client instance
// Configured for optimal session persistence and auth handling
// Uses Supabase's built-in fetch (reliable and optimized for their API)
// robustFetch is only used for external webhooks where connection issues are more common
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // We handle auth state manually (no OAuth redirects)
    storage: getLocalStorage() || undefined,
    storageKey: "supabase.auth.token",
    // Note: Using default implicit flow (not PKCE) since we don't use OAuth redirects
    // PKCE requires detectSessionInUrl: true to work properly
  },
});

