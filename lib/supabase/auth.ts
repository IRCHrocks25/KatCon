import { supabase } from "./client";
import { clearEmailCache } from "./session";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

export type AccountType = "CRM" | "DEV" | "PM" | "AI" | "DESIGN" | "COPYWRITING" | "OTHERS";

export interface AuthUser {
  id: string;
  email: string;
  accountType?: AccountType;
  fullname?: string;
}

interface ProfileData {
  account_type: string;
  fullname?: string;
  approved?: boolean;
}

const isDev = process.env.NODE_ENV === "development";

// Profile fetch timeout (3 seconds)
const PROFILE_FETCH_TIMEOUT = 3000;

/**
 * Check if a user is approved to access the system
 * @param userId - The user's ID from Supabase auth
 * @returns Promise<boolean> - true if approved, false otherwise
 */
async function checkUserApproval(userId: string): Promise<boolean> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      if (isDev) {
        console.warn("[AUTH] Profile check failed:", error?.message || "Profile not found");
      }
      return false;
    }

    return profile.approved === true;
  } catch (error) {
    if (isDev) console.error("[AUTH] Error checking user approval:", error);
    return false;
  }
}

/**
 * Fetch user profile data with timeout
 * @param userId - The user's ID from Supabase auth
 * @returns Promise<ProfileData | null> - Profile data or null if fetch fails
 */
async function fetchUserProfile(userId: string): Promise<ProfileData | null> {
  try {
    const profilePromise = supabase
      .from("profiles")
      .select("account_type, fullname, approved")
      .eq("id", userId)
      .single();

    const timeoutPromise = new Promise<{ data: null; error: null }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: null }), PROFILE_FETCH_TIMEOUT);
    });

    const result = await Promise.race([profilePromise, timeoutPromise]);

    if (result && result.data && !result.error) {
      return result.data as ProfileData;
    }

    if (isDev && result && result.error) {
      console.warn("[AUTH] Profile fetch error:", result.error);
    }

    return null;
  } catch (error) {
    if (isDev) console.error("[AUTH] Profile fetch exception:", error);
    return null;
  }
}

/**
 * Build AuthUser object from session and profile
 */
function buildAuthUser(
  sessionUser: SupabaseUser,
  profile: ProfileData | null
): AuthUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email || "",
    accountType: profile?.account_type as AccountType | undefined,
    fullname: profile?.fullname || undefined,
  };
}

/**
 * Sign up with email and password
 * Creates user account and profile with account type and fullname
 */
export async function signUp(
  email: string,
  password: string,
  accountType: AccountType,
  fullname?: string
): Promise<{ user: SupabaseUser | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signUp error:", error);
    throw error;
  }

  // Create or update profile with account type, fullname, and email
  // Set approved to false by default - admin must manually approve
  if (data.user) {
    // First try to insert, if it fails due to conflict, update instead
    const { error: insertError } = await supabase.from("profiles").insert({
      id: data.user.id,
      email: email,
      account_type: accountType,
      fullname: fullname || null,
      approved: false, // Requires manual approval
    });

    // If insert fails due to conflict (trigger already created profile), update it
    if (insertError) {
      if (isDev) console.log("[AUTH] Profile may already exist, updating instead:", insertError);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          email: email,
          account_type: accountType,
          fullname: fullname || null,
          approved: false,
        })
        .eq("id", data.user.id);

      if (updateError) {
        if (isDev) console.error("[AUTH] signUp profile update error:", updateError);
        throw updateError;
      }
    }
  }

  return { user: data.user, session: data.session };
}

/**
 * Sign in with email and password
 * Checks user approval before allowing access
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: SupabaseUser | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signIn error:", error);
    throw error;
  }

  // Check if user is approved before allowing sign in
  if (data.user) {
    const isApproved = await checkUserApproval(data.user.id);

    if (!isApproved) {
      // Sign out immediately if not approved
      await supabase.auth.signOut();
      throw new Error(
        "Your account is pending approval. An administrator will review your request and you'll be notified once approved."
      );
    }
  }

  return { user: data.user, session: data.session };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  clearEmailCache(); // Clear cached email on logout

  if (error) {
    if (isDev) console.error("[AUTH] signOut error:", error);
    throw error;
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Get user email helper (uses session, fast)
 * @deprecated Use getSession() and access session.user.email directly
 */
export async function getUserEmailFromSession(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.email || null;
}

/**
 * Listen to auth state changes
 * Handles session updates, profile fetching, and approval checks
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): { subscription: { unsubscribe: () => void } } {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (isDev) {
      console.log("[AUTH] onAuthStateChange event:", event, {
        hasSession: !!session,
        hasUser: !!session?.user,
      });
    }

    // Handle SIGNED_OUT event
    if (event === "SIGNED_OUT") {
      clearEmailCache();
      if (isDev) console.log("[AUTH] User signed out, cleared email cache");
      callback(null);
      return;
    }

    // Handle TOKEN_REFRESHED event
    if (event === "TOKEN_REFRESHED") {
      clearEmailCache();
      if (isDev) console.log("[AUTH] Token refreshed, cleared email cache");
      // Continue to process session below
    }

    // No session - user is logged out
    if (!session?.user) {
      clearEmailCache();
      if (isDev) console.log("[AUTH] No session, calling callback with null");
      callback(null);
      return;
    }

    const sessionUser = session.user;

    // Fetch profile data
    const profile = await fetchUserProfile(sessionUser.id);

    // If profile fetch failed, deny access for security
    if (!profile) {
      if (isDev) console.warn("[AUTH] Profile fetch failed, signing out");
      await supabase.auth.signOut();
      callback(null);
      return;
    }

    // Check approval status
    if (profile.approved !== true) {
      if (isDev) console.warn("[AUTH] User not approved, signing out");
      await supabase.auth.signOut();
      callback(null);
      return;
    }

    // Build and return authenticated user
    const user = buildAuthUser(sessionUser, profile);

    if (isDev) {
      console.log("[AUTH] Calling callback with user:", {
        id: user.id,
        email: user.email,
      });
    }

    callback(user);
  });

  return { subscription };
}
