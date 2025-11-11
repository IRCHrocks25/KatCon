import { supabase } from "./client";

const isDev = process.env.NODE_ENV === "development";

export interface User {
  email: string;
  id: string;
}

/**
 * Search for users by email (for autocomplete)
 * Searches auth.users table for matching emails
 */
export async function searchUsers(searchTerm: string): Promise<User[]> {
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser || !currentUser.email) {
    return [];
  }

  // If search term is empty, return empty array
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  try {
    // Query auth.users through a function or use admin API
    // Since we can't directly query auth.users, we'll use a different approach
    // We can query the profiles table which has user emails via the id

    // First, try to get users from profiles table if it has email
    // Otherwise, we'll need to use a Supabase function or admin API

    // For now, let's create a simple search that validates email format
    // and returns potential matches from profiles
    const { error } = await supabase.from("profiles").select("id").limit(100);

    if (error) {
      if (isDev) console.error("Error searching users:", error);
      return [];
    }

    // Since we can't directly query emails from auth.users without admin access,
    // we'll return an empty array and let the UI handle email input validation
    // The user can type any email and we'll validate it on the backend

    // For a better implementation, you would need:
    // 1. A Supabase function that queries auth.users (requires admin)
    // 2. Or store emails in a separate table
    // 3. Or use Supabase Admin API on the server side

    return [];
  } catch (error) {
    if (isDev) console.error("Error in searchUsers:", error);
    return [];
  }
}

/**
 * Validate email format
 */
export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if a user email exists in the system
 */
export async function checkUserExists(email: string): Promise<boolean> {
  if (!email || typeof email !== "string") {
    return false;
  }

  // Basic email format validation
  if (!validateEmailFormat(email)) {
    return false;
  }

  try {
    const response = await fetch("/api/check-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (!response.ok) {
      if (isDev)
        console.error("Error checking user existence:", response.statusText);
      // If API fails, allow the assignment (fail open)
      return true;
    }

    const data = await response.json();
    return data.exists === true;
  } catch (error) {
    if (isDev) console.error("Error checking user existence:", error);
    // If check fails, allow the assignment (fail open)
    return true;
  }
}
