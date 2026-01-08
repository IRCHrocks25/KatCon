import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  // Only warn in development, not during build time
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file"
    );
  }
}

// Create a single, centralized Supabase client instance
// Use dummy values during build time to avoid errors
const finalSupabaseUrl = supabaseUrl || "https://dummy.supabase.co";
const finalSupabaseAnonKey = supabaseAnonKey || "dummy-anon-key";

export const supabase: SupabaseClient = createClient(finalSupabaseUrl, finalSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

