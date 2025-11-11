import { supabase } from "./client";
import { getUserEmail, clearEmailCache } from "./session";

export type AccountType = "CRM TEAM" | "BRANDING TEAM" | "DIVISION TEAM";

export interface AuthUser {
  id: string;
  email: string;
  accountType?: AccountType;
}

const isDev = process.env.NODE_ENV === "development";

// Sign up with email and password
export async function signUp(
  email: string,
  password: string,
  accountType: AccountType
) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signUp error:", error);
    throw error;
  }

  // If user was created, create profile with account type
  if (data.user) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      account_type: accountType,
    });

    if (profileError) {
      if (isDev) console.error("[AUTH] signUp profile error:", profileError);
      throw profileError;
    }
  }

  return data;
}

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signIn error:", error);
    throw error;
  }

  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  clearEmailCache(); // Clear cached email on logout
  if (error) {
    if (isDev) console.error("[AUTH] signOut error:", error);
    throw error;
  }
}

// Get current session
export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// Get user email helper (uses session, fast)
export async function getUserEmailFromSession(): Promise<string | null> {
  return getUserEmail();
}

// Listen to auth state changes
// Fetches profile synchronously before calling callback to ensure complete user data
// Handles TOKEN_REFRESHED, SIGNED_OUT, and SIGNED_IN events
export function onAuthStateChange(callback: (user: AuthUser | null) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (isDev) {
      console.log("[AUTH] onAuthStateChange event:", event, {
        hasSession: !!session,
        hasUser: !!session?.user,
      });
    }

    try {
      // Handle SIGNED_OUT event - clear cache and notify callback
      if (event === "SIGNED_OUT") {
        clearEmailCache();
        if (isDev) console.log("[AUTH] User signed out, cleared email cache");
        callback(null);
        return;
      }

      // Handle TOKEN_REFRESHED event - clear cache to force refresh
      if (event === "TOKEN_REFRESHED") {
        clearEmailCache();
        if (isDev) console.log("[AUTH] Token refreshed, cleared email cache");
        // Continue to process session below
      }

      if (session?.user) {
        // Fetch profile with timeout to prevent hanging
        let profile: { account_type: string } | null = null;
        try {
          const profilePromise = supabase
            .from("profiles")
            .select("account_type")
            .eq("id", session.user.id)
            .single();

          const timeoutPromise = new Promise<{ data: null; error: null }>(
            (resolve) => {
              setTimeout(() => resolve({ data: null, error: null }), 3000); // 3 second timeout
            }
          );

          const result = await Promise.race([profilePromise, timeoutPromise]);

          if (result && result.data && !result.error) {
            profile = result.data;
          } else if (isDev && result && result.error) {
            console.warn("[AUTH] Profile fetch error:", result.error);
          }
        } catch (error) {
          if (isDev) console.warn("[AUTH] Profile fetch failed:", error);
          // Continue without profile - accountType will be undefined
        }

        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email || "",
          accountType: profile?.account_type as AccountType | undefined,
        };

        if (isDev) {
          console.log("[AUTH] Calling callback with user:", {
            id: user.id,
            email: user.email,
          });
        }
        callback(user);
      } else {
        // No session - clear cache and notify callback
        clearEmailCache();
        if (isDev) {
          console.log("[AUTH] No session, calling callback with null");
        }
        callback(null);
      }
    } catch (error) {
      if (isDev) console.error("[AUTH] onAuthStateChange error:", error);
      // Always call callback to prevent infinite loading
      if (session?.user) {
        callback({
          id: session.user.id,
          email: session.user.email || "",
          accountType: undefined,
        });
      } else {
        clearEmailCache();
        callback(null);
      }
    }
  });

  return { subscription };
}
