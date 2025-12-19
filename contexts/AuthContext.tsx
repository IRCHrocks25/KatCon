"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { removeStorageItem } from "@/lib/utils/storage";
import type { Session } from "@supabase/supabase-js";
import {
  AccountType,
  AuthUser,
  signIn,
  signOut,
  signUp,
  fetchUserProfile,
  buildAuthUser,
} from "@/lib/supabase/auth";

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    accountType: AccountType,
    fullname?: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Track if we're in the middle of checking approval (sign-in or sign-up)
  const isCheckingApprovalRef = React.useRef(false);

  useEffect(() => {
    // Set up auth state listener - simple, like the working implementation
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[AUTH] Event:", _event);

      // Skip state updates during sign-in approval check
      // This prevents showing chat UI before approval is confirmed
      if (isCheckingApprovalRef.current && _event === "SIGNED_IN") {
        console.log("[AUTH] Skipping state update during approval check");
        return;
      }

      // Directly set session and user - no profile fetch on session restore
      // If they have a valid session, they were already approved at login
      setSession(session);

      if (session?.user) {
        // Build basic user object - profile will be fetched separately if needed
        setUser({
          id: session.user.id,
          email: session.user.email || "",
          // Profile data will be lazy-loaded later if needed
          accountType: undefined,
          fullname: undefined,
          username: undefined,
          avatarUrl: undefined,
        });
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || "",
          accountType: undefined,
          fullname: undefined,
          username: undefined,
          avatarUrl: undefined,
        });
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Lazy-load profile data after session is confirmed (for UI display)
  useEffect(() => {
    if (user?.id && !user.accountType) {
      // Only fetch if we don't have profile data yet
      fetchUserProfile(user.id).then((profile) => {
        if (profile) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  accountType: profile.account_type as AccountType,
                  fullname: profile.fullname,
                  username: profile.username,
                  avatarUrl: profile.avatar_url,
                }
              : null
          );
        }
      });
    }
  }, [user?.id, user?.accountType]);

  // Memoized handlers
  const handleSignUp = useCallback(
    async (
      email: string,
      password: string,
      accountType: AccountType,
      fullname?: string
    ) => {
      try {
        // Set flag to prevent onAuthStateChange from updating state during signup
        // This prevents showing chat UI before signout completes
        isCheckingApprovalRef.current = true;

        const { error } = await signUp(email, password, accountType, fullname);
        if (error) throw error;

        // User is auto-signed out after signup in signUp function
        // Explicitly ensure state is cleared
        setUser(null);
        setSession(null);
        setLoading(false);
      } finally {
        // Always clear the flag
        isCheckingApprovalRef.current = false;
      }
    },
    []
  );

  const handleSignIn = useCallback(async (email: string, password: string) => {
    try {
      // Set flag to prevent onAuthStateChange from updating state prematurely
      isCheckingApprovalRef.current = true;

      const { error } = await signIn(email, password);
      if (error) throw error;

      // Check approval ONLY on explicit login (not on session restore)
      // This prevents timeout issues on page refresh
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.data.session?.user) {
        const profile = await fetchUserProfile(
          sessionResult.data.session.user.id
        );

        if (profile?.approved !== true) {
          // Not approved - sign out immediately
          await supabase.auth.signOut();
          throw new Error(
            "Your account is pending approval. An administrator will review your request."
          );
        }

        // Approval passed! Now update state manually
        setSession(sessionResult.data.session);
        setUser(buildAuthUser(sessionResult.data.session.user, profile));
        setLoading(false);
      }
    } finally {
      // Always clear the flag
      isCheckingApprovalRef.current = false;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      console.log("[AUTH] Logging out...");

      // Optimistically clear state immediately (don't wait for API)
      setUser(null);
      setSession(null);
      removeStorageItem("chatSessionId");

      // Then call signOut in background
      await signOut();

      console.log("[AUTH] Logout complete");
    } catch (error) {
      console.error("[AUTH] Logout error (ignored):", error);
      // Even if signOut fails, state is already cleared
    }
  }, []);

  const handleRefreshProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      const profile = await fetchUserProfile(user.id);
      if (profile) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                accountType: profile.account_type as AccountType,
                fullname: profile.fullname,
                username: profile.username,
                avatarUrl: profile.avatar_url,
              }
            : null
        );
      }
    } catch (error) {
      console.error("Error refreshing profile:", error);
    }
  }, [user?.id]);

  // Memoize context value before any early returns
  const contextValue = useMemo(
    () => ({
      user,
      session,
      loading,
      signUp: handleSignUp,
      signIn: handleSignIn,
      logout: handleLogout,
      refreshProfile: handleRefreshProfile,
    }),
    [user, session, loading, handleSignUp, handleSignIn, handleLogout, handleRefreshProfile]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
