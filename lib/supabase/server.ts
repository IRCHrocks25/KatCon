import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file"
  );
}

// Create a server-side Supabase client that uses the user's session
export async function createServerClient() {
  const cookieStore = await cookies();
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore.set(name, value, options);
        } catch (error) {
          // Ignore errors in server components
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        } catch (error) {
          // Ignore errors in server components
        }
      },
    },
  });
}

