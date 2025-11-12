import { supabase } from "./client";
import { getUserEmail, clearEmailCache } from "./session";

export type AccountType = "CRM" | "DEV" | "PM" | "AI" | "DESIGN" | "COPYWRITING" | "OTHERS";

export interface AuthUser {
  id: string;
  email: string;
  accountType?: AccountType;
  fullname?: string;
}

const isDev = process.env.NODE_ENV === "development";

// Sign up with email and password
export async function signUp(
  email: string,
  password: string,
  accountType: AccountType,
  fullname?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    if (isDev) console.error("[AUTH] signUp error:", error);
    throw error;
  }

  // If user was created, create or update profile with account type, fullname, and email
  // Set approved to false by default - admin must manually approve
  // Use upsert in case trigger already created a basic profile
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

  // Check if user is approved before allowing sign in
  if (data.user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", data.user.id)
      .single();

    if (profileError) {
      if (isDev) console.error("[AUTH] signIn profile check error:", profileError);
      // If we can't check the profile, deny access for security
      await supabase.auth.signOut();
      throw new Error("Unable to verify account status. Please contact support.");
    }

    // If profile doesn't exist or user is not approved, deny access
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error("Account profile not found. Please contact support.");
    }

    if (profile.approved !== true) {
      await supabase.auth.signOut();
      throw new Error(
        "Your account is pending approval. An administrator will review your request and you'll be notified once approved."
      );
    }
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
        let profile: { account_type: string; fullname?: string; approved?: boolean } | null = null;
        try {
          const profilePromise = supabase
            .from("profiles")
            .select("account_type, fullname, approved")
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
            
            // If user is not approved, sign them out immediately
            if (profile.approved !== true) {
              if (isDev) console.warn("[AUTH] User not approved, signing out");
              await supabase.auth.signOut();
              callback(null);
              return;
            }
          } else {
            // If we can't fetch the profile or it doesn't exist, deny access for security
            if (isDev) {
              console.warn("[AUTH] Profile fetch failed or profile doesn't exist, signing out");
              if (result && result.error) {
                console.warn("[AUTH] Profile error:", result.error);
              }
            }
            await supabase.auth.signOut();
            callback(null);
            return;
          }
        } catch (error) {
          // If profile fetch fails, deny access for security
          if (isDev) console.warn("[AUTH] Profile fetch failed:", error);
          await supabase.auth.signOut();
          callback(null);
          return;
        }

        const user: AuthUser = {
          id: session.user.id,
          email: session.user.email || "",
          accountType: profile?.account_type as AccountType | undefined,
          fullname: profile?.fullname || undefined,
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
      // CRITICAL: Always call callback, even on error, to prevent infinite loading
      if (isDev) console.error("[AUTH] onAuthStateChange error:", error);
      
      try {
        // If we have a session but error occurred, try to get basic user info
        if (session?.user) {
          callback({
            id: session.user.id,
            email: session.user.email || "",
            accountType: undefined,
            fullname: undefined,
          });
        } else {
          clearEmailCache();
          callback(null);
        }
      } catch (callbackError) {
        // Even if callback fails, ensure we don't hang
        if (isDev) console.error("[AUTH] Callback error:", callbackError);
        clearEmailCache();
        callback(null);
      }
    }
  });

  return { subscription };
}
