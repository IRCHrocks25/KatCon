import { supabase } from "./client";

let cachedEmail: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get user email from session (fast, uses localStorage)
 * Caches result for 1 minute to avoid repeated calls
 */
export async function getUserEmail(): Promise<string | null> {
  const now = Date.now();
  
  // Return cached email if still valid
  if (cachedEmail && now - cacheTimestamp < CACHE_TTL) {
    return cachedEmail;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.email) {
    cachedEmail = session.user.email;
    cacheTimestamp = now;
    return cachedEmail;
  }

  cachedEmail = null;
  cacheTimestamp = 0;
  return null;
}

/**
 * Clear the email cache (useful after logout or token refresh)
 */
export function clearEmailCache(): void {
  cachedEmail = null;
  cacheTimestamp = 0;
}

/**
 * Invalidate the email cache (force refresh on next call)
 * This is useful when you want to ensure fresh data on the next getUserEmail() call
 */
export function invalidateEmailCache(): void {
  clearEmailCache();
}

