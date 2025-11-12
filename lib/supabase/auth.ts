import { supabase } from "./client";
import { clearEmailCache } from "./session";
import { removeStorageItem } from "@/lib/utils/storage";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

export type AccountType =
  | "CRM"
  | "DEV"
  | "PM"
  | "AI"
  | "DESIGN"
  | "COPYWRITING"
  | "OTHERS";

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
// Enable auth debugging in production (set NEXT_PUBLIC_DEBUG_AUTH=true)
const debugAuth = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
const shouldLogAuth = isDev || debugAuth;

// Profile fetch timeout (10 seconds for better UX)
// This prevents users from waiting too long on slow connections
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
      if (shouldLogAuth) {
        console.warn(
          "[AUTH DEBUG] Profile check failed:",
          error?.message || "Profile not found"
        );
      }
      return false;
    }

    const isApproved = profile.approved === true;

    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] Approval check:", {
        approved: profile.approved,
        approvedType: typeof profile.approved,
        isApproved: isApproved,
      });
    }

    return isApproved;
  } catch (error) {
    if (shouldLogAuth)
      console.error("[AUTH DEBUG] Error checking user approval:", error);
    return false;
  }
}

/**
 * Fetch user profile data with optional timeout
 * @param userId - The user's ID from Supabase auth
 * @param useTimeout - Whether to use timeout (false for initial session restoration)
 * @returns Promise<ProfileData | null> - Profile data or null if fetch fails
 */
async function fetchUserProfile(
  userId: string,
  useTimeout: boolean = true
): Promise<ProfileData | null> {
  try {
    const profilePromise = supabase
      .from("profiles")
      .select("account_type, fullname, approved")
      .eq("id", userId)
      .single();

    console.log("id is", userId);
    const result = await profilePromise;

    /*  if (useTimeout) {
      // Use timeout for signup/login flows where we need quick approval checks
      const timeoutPromise = new Promise<{
        data: null;
        error: { message: string };
      }>((resolve) => {
        setTimeout(
          () =>
            resolve({
              data: null,
              error: { message: "Profile fetch timeout" },
            }),
          PROFILE_FETCH_TIMEOUT
        );
      });

      result = await Promise.race([profilePromise, timeoutPromise]);
    } else {
      // No timeout for session restoration - let it take as long as needed
      // This prevents cold start issues in serverless environments */

    /*  } */

    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] Profile fetch result:", {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        errorMessage: result?.error?.message,
        dataKeys: result?.data ? Object.keys(result.data) : [],
      });
    }

    // Check if result has valid data
    if (result?.data && !result.error) {
      if (shouldLogAuth) {
        console.log("[AUTH DEBUG] Profile fetch success:", {
          account_type: result.data.account_type,
          hasFullname: !!result.data.fullname,
          approved: result.data.approved,
          approvedType: typeof result.data.approved,
          approvedIsTrue: result.data.approved === true,
          approvedStrictEqual: result.data.approved === true,
        });
      }
      return result.data as ProfileData;
    }

    // Log why profile fetch failed
    if (shouldLogAuth) {
      if (result?.error) {
        console.warn("[AUTH DEBUG] Profile fetch error:", result.error);
      } else {
        console.warn("[AUTH DEBUG] Profile fetch failed: No data returned", {
          result: result,
        });
      }
    }

    return null;
  } catch (error) {
    if (shouldLogAuth)
      console.error("[AUTH DEBUG] Profile fetch exception:", error);
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
    if (shouldLogAuth) console.error("[AUTH DEBUG] signUp error:", error);
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
      if (shouldLogAuth)
        console.log(
          "[AUTH DEBUG] Profile may already exist, updating instead:",
          insertError
        );

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
        if (shouldLogAuth)
          console.error(
            "[AUTH DEBUG] signUp profile update error:",
            updateError
          );
        throw updateError;
      }
    }

    // IMPORTANT: Sign out immediately after signup since account needs approval
    // This prevents the user from accessing the app with an unapproved account
    if (shouldLogAuth)
      console.log("[AUTH DEBUG] signUp: Signing out user (pending approval)");

    // Force clear the session immediately (don't wait for API call)
    removeStorageItem("supabase.auth.token");

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
    if (shouldLogAuth) console.error("[AUTH DEBUG] signIn error:", error);
    throw error;
  }

  // Step 2: Check approval status BEFORE allowing session to persist
  if (data.user) {
    if (shouldLogAuth)
      console.log(
        "[AUTH DEBUG] Checking approval on signIn for user:",
        data.user.id
      );

    const isApproved = await checkUserApproval(data.user.id);

    if (!isApproved) {
      // Immediately clear session - user is not approved
      if (shouldLogAuth)
        console.warn("[AUTH DEBUG] signIn blocked: User not approved");

      // Force clear local session immediately
      removeStorageItem("supabase.auth.token");

      // Sign out on server
      await supabase.auth.signOut().catch(() => {
        // Ignore signOut errors - session already cleared
      });

      // Throw error to inform user
      throw new Error(
        "Your account is pending approval. An administrator will review your request and you'll be notified once approved."
      );
    }

    if (shouldLogAuth)
      console.log("[AUTH DEBUG] signIn success: User approved");
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
      console.log(
        "[AUTH] signOut error caught, treating as successful logout:",
        error
      );
    }

    // Clear local storage manually to ensure clean state
    removeStorageItem("supabase.auth.token");
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
      if (shouldLogAuth) console.error("[AUTH DEBUG] getSession error:", error);
      return null;
    }

    if (shouldLogAuth && session) {
      console.log(
        "[AUTH DEBUG] getSession: Session found for user",
        session.user.email
      );
    } else if (shouldLogAuth) {
      console.log("[AUTH DEBUG] getSession: No session found");
    }

    return session;
  } catch (error) {
    if (shouldLogAuth)
      console.error("[AUTH DEBUG] getSession exception:", error);
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
export function onAuthStateChange(callback: (user: AuthUser | null) => void): {
  subscription: { unsubscribe: () => void };
} {
  // Track if this is the first auth event (initial session restoration)
  // After the first event, we skip profile checks on SIGNED_IN to prevent timeout loops
  let isInitialEvent = true;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] onAuthStateChange event:", event, {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        isInitial: isInitialEvent,
      });
    }

    // Handle SIGNED_OUT event
    if (event === "SIGNED_OUT") {
      clearEmailCache();
      if (shouldLogAuth)
        console.log("[AUTH DEBUG] User signed out, cleared email cache");
      callback(null);
      return;
    }

    // Handle TOKEN_REFRESHED and subsequent SIGNED_IN events (after initial load)
    // Skip profile re-fetch to avoid timeouts and unnecessary approval checks
    // The user was already verified on initial login/session restoration
    if (
      event === "TOKEN_REFRESHED" ||
      (event === "SIGNED_IN" && !isInitialEvent)
    ) {
      clearEmailCache();
      if (shouldLogAuth)
        console.log(
          `[AUTH DEBUG] ${event} event - session refreshed, skipping profile check`
        );

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

    // Mark that we've processed the initial event
    // Future SIGNED_IN events will be treated as token refreshes
    if (isInitialEvent) {
      isInitialEvent = false;
      if (shouldLogAuth)
        console.log(
          "[AUTH DEBUG] Initial event processed, future SIGNED_IN will skip profile check"
        );
    }

    // NOTE: Only INITIAL_SESSION and first SIGNED_IN (signup/login) reach here
    // This prevents repeated profile fetches on every token refresh

    // No session - user is logged out
    if (!session?.user) {
      clearEmailCache();
      if (shouldLogAuth)
        console.log("[AUTH DEBUG] No session, calling callback with null");
      callback(null);
      return;
    }

    const sessionUser = session.user;

    // Fetch profile data
    // On INITIAL_SESSION, don't use timeout to handle serverless cold starts
    // On first SIGNED_IN (signup), use timeout for quick approval check
    const isInitialSessionRestore = event === "INITIAL_SESSION";
    const profile = await fetchUserProfile(
      sessionUser.id,
      !isInitialSessionRestore
    );

    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] After fetchUserProfile:", {
        event: event,
        usedTimeout: !isInitialSessionRestore,
        profileExists: !!profile,
        profileData: profile,
      });
    }

    // If profile fetch failed, deny access for security
    if (!profile) {
      console.warn("[AUTH DEBUG] Profile fetch failed, clearing session");
      // Use direct session removal instead of signOut to prevent loops
      removeStorageItem("supabase.auth.token");
      callback(null);
      return;
    }

    // Check approval status - CRITICAL for signup flow
    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] Checking approval:", {
        approved: profile.approved,
        approvedType: typeof profile.approved,
        isStrictlyTrue: profile.approved === true,
        checkResult: profile.approved !== true,
      });
    }

    if (profile.approved !== true) {
      console.warn("[AUTH DEBUG] User not approved, clearing session", {
        approved: profile.approved,
        approvedType: typeof profile.approved,
      });
      // Use direct session removal instead of signOut to prevent loops
      removeStorageItem("supabase.auth.token");
      callback(null);
      return;
    }

    if (shouldLogAuth)
      console.log("[AUTH DEBUG] User approved, allowing access");

    // Build and return authenticated user
    const user = buildAuthUser(sessionUser, profile);

    if (shouldLogAuth) {
      console.log("[AUTH DEBUG] Calling callback with user:", {
        id: user.id,
        email: user.email,
      });
    }

    callback(user);
  });

  return { subscription };
}
