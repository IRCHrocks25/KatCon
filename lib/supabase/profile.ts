import { supabase } from "./client";
import { robustFetch } from "@/lib/utils/fetch";

const isDev = process.env.NODE_ENV === "development";

// Module-level cache for profiles (keyed by user ID)
interface ProfileCacheEntry {
  profile: UserProfile;
  timestamp: number;
}

const profileCache = new Map<string, ProfileCacheEntry>();
let cachedUserId: string | null = null;

export interface UserProfile {
  id: string;
  email: string;
  fullname?: string;
  username?: string;
  avatarUrl?: string;
  accountType: string;
  approved: boolean;
}

/**
 * Get user profile with caching
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  // Check cache first
  const cacheEntry = profileCache.get(userId);
  if (cacheEntry && cachedUserId === userId) {
    // Cache is valid (same user)
    return cacheEntry.profile;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, fullname, username, avatar_url, account_type, approved"
      )
      .eq("id", userId)
      .single();

    if (error) {
      if (isDev) console.error("Error fetching profile:", error);
      return null;
    }

    if (!data) return null;

    const profile: UserProfile = {
      id: data.id,
      email: data.email || "",
      fullname: data.fullname || undefined,
      username: data.username || undefined,
      avatarUrl: data.avatar_url || undefined,
      accountType: data.account_type,
      approved: data.approved || false,
    };

    // Update cache
    profileCache.set(userId, {
      profile,
      timestamp: Date.now(),
    });
    cachedUserId = userId;

    return profile;
  } catch (error) {
    if (isDev) console.error("Error in getProfile:", error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  updates: {
    username?: string;
    fullname?: string;
  }
): Promise<UserProfile | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await robustFetch("/api/profile/update", {
      method: "POST",
      headers,
      body: JSON.stringify(updates),
      retries: 2,
      timeout: 15000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to update profile");
    }

    const data = await response.json();

    // Invalidate cache for this user
    profileCache.delete(userId);
    if (cachedUserId === userId) {
      cachedUserId = null;
    }

    return data.profile;
  } catch (error) {
    if (isDev) console.error("Error in updateProfile:", error);
    throw error;
  }
}

/**
 * Get auth headers for API requests
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * Invalidate profile cache for a user
 */
export function invalidateProfileCache(userId?: string): void {
  if (userId) {
    profileCache.delete(userId);
    if (cachedUserId === userId) {
      cachedUserId = null;
    }
  } else {
    // Clear all cache
    profileCache.clear();
    cachedUserId = null;
  }
}

/**
 * Clear profile cache on logout
 */
export function clearProfileCache(): void {
  profileCache.clear();
  cachedUserId = null;
}
