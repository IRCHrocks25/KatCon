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

// Profile fetch timeout (10 seconds - increased for slower connections)
const PROFILE_FETCH_TIMEOUT = 10000;

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

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>(
      (resolve) => {
        setTimeout(
          () => resolve({ data: null, error: { message: "Profile fetch timeout" } }),
          PROFILE_FETCH_TIMEOUT
        );
      }
    );

    const result = await Promise.race([profilePromise, timeoutPromise]);

    // Check if result has valid data
    if (result?.data && !result.error) {
      if (isDev) {
        console.log("[AUTH] Profile fetch success:", {
          hasAccountType: !!result.data.account_type,
          hasFullname: !!result.data.fullname,
          approved: result.data.approved,
        });
      }
      return result.data as ProfileData;
    }

    // Log why profile fetch failed
    if (isDev) {
      if (result?.error) {
        console.warn("[AUTH] Profile fetch error:", result.error);
      } else {
        console.warn("[AUTH] Profile fetch failed: No data returned");
      }
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
 * Note: User will be signed out immediately since approval is required
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

    // IMPORTANT: Sign out immediately after signup since account needs approval
    // This prevents the user from accessing the app with an unapproved account
    if (isDev) console.log("[AUTH] signUp: Signing out user (pending approval)");
    
    // Force clear the session immediately (don't wait for API call)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("supabase.auth.token");
    }
    
    // Also call signOut to clear on server side
    await supabase.auth.signOut().catch(() => {
      // Ignore errors - session is already cleared locally
    });
  }

  return { user: data.user, session: null }; // Return null session since we signed them out
}

/**
 * Sign in with email and password
 * Checks user approval BEFORE creating session to prevent unauthorized access
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: SupabaseUser | null; session: Session | null }> {
  // Step 1: Authenticate credentials (creates temporary session)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signIn error:", error);
    throw error;
  }

  // Step 2: Check approval status BEFORE allowing session to persist
  if (data.user) {
    const isApproved = await checkUserApproval(data.user.id);

    if (!isApproved) {
      // Immediately clear session - user is not approved
      if (isDev) console.warn("[AUTH] signIn blocked: User not approved");
      
      // Force clear local session immediately
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("supabase.auth.token");
      }
      
      // Sign out on server
      await supabase.auth.signOut().catch(() => {
        // Ignore signOut errors - session already cleared
      });
      
      // Throw error to inform user
      throw new Error(
        "Your account is pending approval. An administrator will review your request and you'll be notified once approved."
      );
    }
    
    if (isDev) console.log("[AUTH] signIn success: User approved");
  }

  // Step 3: User is approved, return session
  return { user: data.user, session: data.session };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    clearEmailCache(); // Clear cached email on logout

    if (error) {
      // Ignore "Auth session missing" error - it means user is already signed out
      if (error.message?.includes("Auth session missing")) {
        if (isDev) console.log("[AUTH] signOut: Session already cleared");
        return; // Successfully signed out (already was)
      }
      
      if (isDev) console.error("[AUTH] signOut error:", error);
      throw error;
    }
  } catch (error) {
    // Catch any other errors (like 403 Forbidden from expired tokens)
    // If logout fails, it usually means the session is already invalid
    // So we treat it as a successful logout
    clearEmailCache();
    
    if (isDev) {
      console.log("[AUTH] signOut error caught, treating as successful logout:", error);
    }
    
    // Clear local storage manually to ensure clean state
    if (typeof globalThis.window !== "undefined") {
      try {
        globalThis.window.localStorage.removeItem("supabase.auth.token");
      } catch (storageError) {
        // Ignore storage errors
      }
    }
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    
    if (error) {
      if (isDev) console.error("[AUTH] getSession error:", error);
      return null;
    }
    
    if (isDev && session) {
      console.log("[AUTH] getSession: Session found for user", session.user.email);
    } else if (isDev) {
      console.log("[AUTH] getSession: No session found");
    }
    
    return session;
  } catch (error) {
    if (isDev) console.error("[AUTH] getSession exception:", error);
    return null;
  }
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

    // Handle TOKEN_REFRESHED event (auto token refresh)
    // For token refresh ONLY, skip profile check since user was already verified
    if (event === "TOKEN_REFRESHED") {
      clearEmailCache();
      if (isDev) console.log("[AUTH] TOKEN_REFRESHED event - session refreshed");
      
      if (session?.user) {
        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email || "",
          accountType: undefined,
          fullname: undefined,
        };
        callback(user);
        return;
      }
    }
    
    // NOTE: SIGNED_IN events should continue to profile check below
    // Because SIGNED_IN fires on signup and we need to verify approval

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
      if (isDev) console.warn("[AUTH] Profile fetch failed, clearing session");
      // Use direct session removal instead of signOut to prevent loops
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("supabase.auth.token");
      }
      callback(null);
      return;
    }

    // Check approval status - CRITICAL for signup flow
    if (profile.approved !== true) {
      if (isDev) console.warn("[AUTH] User not approved, clearing session");
      // Use direct session removal instead of signOut to prevent loops
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("supabase.auth.token");
      }
      callback(null);
      return;
    }
    
    if (isDev) console.log("[AUTH] User approved, allowing access");

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
