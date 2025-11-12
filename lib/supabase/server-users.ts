import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * Validate email format
 */
export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if a user email exists in the system (server-side)
 * Uses Supabase admin client directly without API calls
 */
export async function checkUserExistsServer(email: string): Promise<boolean> {
  if (!email || typeof email !== "string") {
    return false;
  }

  // Basic email format validation
  if (!validateEmailFormat(email)) {
    return false;
  }

  // If service role key is not available, we can't check auth.users
  // Fallback: return true (allow the assignment)
  if (!supabaseServiceRoleKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set, cannot verify user existence");
    return true;
  }

  try {
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
      return true;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userExists = users?.users?.some(
      (user) => user.email?.toLowerCase() === normalizedEmail
    ) || false;

    return userExists;
  } catch (error) {
    console.error("Error in checkUserExistsServer:", error);
    // Fail open - if we can't check, allow the assignment
    return true;
  }
}

