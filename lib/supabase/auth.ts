import { supabase } from "./client";

export type AccountType = "CRM TEAM" | "BRANDING TEAM" | "DIVISION TEAM";

export interface AuthUser {
  id: string;
  email: string;
  accountType?: AccountType;
}

// Sign up with email and password
export async function signUp(
  email: string,
  password: string,
  accountType: AccountType
) {
  // Create auth user
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) throw error;

  // If user was created, create profile with account type
  if (data.user) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      account_type: accountType,
    });

    if (profileError) {
      // If profile creation fails, we should handle it
      // For now, we'll throw the error
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

  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Get current user
export async function getCurrentUser(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch profile to get account type
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email || "",
    accountType: profile?.account_type as AccountType | undefined,
  };
}

// Get current session
export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// Listen to auth state changes
export function onAuthStateChange(callback: (user: AuthUser | null) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      // Fetch profile to get account type
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", session.user.id)
        .single();

      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email || "",
        accountType: profile?.account_type as AccountType | undefined,
      };
      callback(user);
    } else {
      callback(null);
    }
  });

  return { subscription };
}
