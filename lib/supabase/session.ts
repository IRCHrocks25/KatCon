import { supabase } from "./client";

// Lightweight in-memory cache for email
// Supabase already caches session in localStorage, this is an additional optimization
let cachedEmail: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30000; // 30 seconds (reduced from 1 minute for better freshness)

/**
 * Get user email from session
 * Uses Supabase's session cache (localStorage) as primary source
 * Adds lightweight in-memory cache to reduce repeated getSession() calls
 * 
 * This is optimized for non-React contexts (e.g., reminders.ts)
 * In React components, prefer using the AuthContext's user.email
 */
export async function getUserEmail(): Promise<string | null> {
  const now = Date.now();
  
  // Return cached email if still valid
  if (cachedEmail && now - cacheTimestamp < CACHE_TTL) {
    return cachedEmail;
  }

  // Get session from Supabase (uses localStorage cache internally)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.email) {
    cachedEmail = session.user.email;
    cacheTimestamp = now;
    return cachedEmail;
  }

  // No session - clear cache
  cachedEmail = null;
  cacheTimestamp = 0;
  return null;
}

/**
 * Clear the email cache
 * Called on logout, sign in, and token refresh events
 * This ensures cache stays in sync with auth state
 */
export function clearEmailCache(): void {
  cachedEmail = null;
  cacheTimestamp = 0;
}

/**
 * Invalidate the email cache (force refresh on next call)
 * Alias for clearEmailCache() for consistency
 */
export function invalidateEmailCache(): void {
  clearEmailCache();
}

