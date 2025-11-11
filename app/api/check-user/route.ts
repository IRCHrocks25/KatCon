import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create admin client for checking user existence
// Note: This requires SUPABASE_SERVICE_ROLE_KEY in environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required", exists: false },
        { status: 400 }
      );
    }

    // If service role key is not available, we can't check auth.users
    // Fallback: return true (allow the assignment)
    if (!supabaseServiceRoleKey) {
      console.warn("SUPABASE_SERVICE_ROLE_KEY not set, cannot verify user existence");
      return NextResponse.json({ exists: true });
    }

    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if user exists by trying to get user by email
    // Using admin API to list users and filter by email
    const { data: users, error } = await adminClient.auth.admin.listUsers();

    if (error) {
      console.error("Error checking user existence:", error);
      // If we can't check, allow the assignment (fail open)
      return NextResponse.json({ exists: true });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userExists = users?.users?.some(
      (user) => user.email?.toLowerCase() === normalizedEmail
    ) || false;

    return NextResponse.json({ exists: userExists });
  } catch (error) {
    console.error("Error in check-user API route:", error);
    // Fail open - if we can't check, allow the assignment
    return NextResponse.json({ exists: true });
  }
}

