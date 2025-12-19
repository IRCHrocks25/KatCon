import { supabase } from "./client";
import type {
  Session,
  User as SupabaseUser,
  AuthError,
} from "@supabase/supabase-js";

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
  username?: string;
  avatarUrl?: string;
}

interface ProfileData {
  account_type: string;
  fullname?: string;
  username?: string;
  avatar_url?: string;
  approved?: boolean;
}

/**
 * Fetch user profile data from database with timeout and retry
 */
export async function fetchUserProfile(
  userId: string,
  retryCount = 0
): Promise<ProfileData | null> {
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 30000; // Increased to 30s for cold starts

  try {
    console.log(
      `[AUTH] fetchUserProfile attempt ${retryCount + 1}/${
        MAX_RETRIES + 1
      } for:`,
      userId
    );

    // Add timeout to prevent hanging forever
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn(
          `[AUTH] Profile fetch timeout after ${TIMEOUT_MS / 1000}s`
        );
        resolve(null);
      }, TIMEOUT_MS);
    });

    const fetchPromise = supabase
      .from("profiles")
      .select("account_type, fullname, username, avatar_url, approved")
      .eq("id", userId)
      .single();

    const result = await Promise.race([fetchPromise, timeoutPromise]);

    if (!result) {
      console.warn("[AUTH] Profile fetch timeout or null result");

      // Retry if we haven't exceeded max retries
      if (retryCount < MAX_RETRIES) {
        console.log("[AUTH] Retrying profile fetch...");
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
        return fetchUserProfile(userId, retryCount + 1);
      }

      return null;
    }

    // Type guard: result is from fetchPromise (not null from timeout)
    if ("data" in result && "error" in result) {
      const { data, error } = result;

      if (error || !data) {
        console.warn(
          "[AUTH] Profile fetch failed:",
          error?.message || "No data"
        );

        // Retry on error if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES) {
          console.log("[AUTH] Retrying after error...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return fetchUserProfile(userId, retryCount + 1);
        }

        return null;
      }

      console.log("[AUTH] Profile fetch success:", {
        hasData: !!data,
        approved: data.approved,
      });
      return data as ProfileData;
    }

    console.warn("[AUTH] Unexpected result type from Promise.race");
    return null;
  } catch (error) {
    console.error("[AUTH] Profile fetch exception:", error);

    // Retry on exception if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      console.log("[AUTH] Retrying after exception...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchUserProfile(userId, retryCount + 1);
    }

    return null;
  }
}

/**
 * Build AuthUser object from Supabase user and profile
 */
export function buildAuthUser(
  sessionUser: SupabaseUser,
  profile: ProfileData | null
): AuthUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email || "",
    accountType: profile?.account_type as AccountType | undefined,
    fullname: profile?.fullname || undefined,
    username: profile?.username || undefined,
    avatarUrl: profile?.avatar_url || undefined,
  };
}

/**
 * Sign up with email and password
 * Creates user account and profile with account type and fullname
 * Note: User needs manual approval before they can log in
 */
export async function signUp(
  email: string,
  password: string,
  accountType: AccountType,
  fullname?: string
): Promise<{ error: AuthError | null }> {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    return { error };
  }

  // Create profile with account type, fullname, and set approved to false
  if (data.user) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: email,
      account_type: accountType,
      fullname: fullname || null,
      approved: false, // Requires manual approval
    });

    if (profileError) {
      console.error("[AUTH] Profile creation error:", profileError);
      return { error: profileError as unknown as AuthError };
    }

    // IMMEDIATELY clear localStorage before signOut to prevent UI flash
    if (globalThis.window !== undefined) {
      const keysToRemove = Object.keys(localStorage).filter(
        (key) => key.startsWith("sb-") || key.includes("supabase")
      );
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      console.log("[AUTH] Signup: Cleared session keys immediately");
    }

    // Sign out after signup - user needs approval first
    await supabase.auth.signOut();
  }

  return { error: null };
}

/**
 * Sign in with email and password
 * Simple wrapper - approval check happens in AuthContext
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { error };
}

/**
 * Sign out the current user
 * Ensures session is fully cleared from localStorage
 */
export async function signOut(): Promise<void> {
  try {
    // Call Supabase signOut
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[AUTH] signOut error:", error);
  }

  // Force clear all Supabase session keys from localStorage
  // This ensures a clean logout even if the API call fails
  if (globalThis.window !== undefined) {
    const keysToRemove = Object.keys(localStorage).filter(
      (key) => key.startsWith("sb-") || key.includes("supabase")
    );
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    console.log("[AUTH] Cleared session keys:", keysToRemove);
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
