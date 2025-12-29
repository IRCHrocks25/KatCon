import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Middleware to validate JWT tokens for API routes
 * Extracts and validates the JWT from Authorization header
 * Returns user context if valid, or error response if invalid
 */
export async function validateAuth(request: NextRequest) {
  try {
    // Create Supabase client for validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Extract token from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        error: NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        ),
      };
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify the JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("JWT validation failed:", error?.message);
      return {
        error: NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        ),
      };
    }

    // Check if user is approved (for additional security)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      console.error("User not approved:", profileError?.message);
      return {
        error: NextResponse.json(
          { error: "Account not approved" },
          { status: 403 }
        ),
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email!,
        profile: profile,
      },
    };
  } catch (error) {
    console.error("Auth validation error:", error);
    return {
      error: NextResponse.json(
        { error: "Authentication error" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Create authenticated Supabase client for API routes
 * Uses the user's JWT token instead of service role key
 */
export function createAuthenticatedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
