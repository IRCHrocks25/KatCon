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
}

interface ProfileData {
  account_type: string;
  fullname?: string;
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
      .select("account_type, fullname, approved")
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

    // Sign out immediately after signup - user needs approval first
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
 * Simple wrapper - let Supabase handle it
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
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
