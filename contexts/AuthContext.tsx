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
import { setUserStatus } from "@/lib/supabase/messaging";

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
  // Track if we're currently fetching profile to prevent duplicate fetches
  const profileFetchingRef = React.useRef<string | null>(null);

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
        // Preserve existing profile data if user ID hasn't changed
        setUser((prev) => {
          // If same user, preserve profile data to avoid unnecessary refetches
          if (prev?.id === session.user.id && prev.accountType) {
            return {
              ...prev,
              id: session.user.id,
              email: session.user.email || prev.email || "",
              // Keep all existing profile data
            };
          }
          // New user or no profile data - reset (profile will be lazy-loaded)
          return {
            id: session.user.id,
            email: session.user.email || "",
            accountType: undefined,
            fullname: undefined,
            username: undefined,
            avatarUrl: undefined,
          };
        });
      } else {
        setUser(null);
        profileFetchingRef.current = null; // Clear ref on logout
      }

      setLoading(false);
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session?.user) {
        // On mount, always start fresh (no profile data yet)
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
        profileFetchingRef.current = null;
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Lazy-load profile data after session is confirmed (for UI display)
  useEffect(() => {
    // Only fetch if:
    // 1. We have a user ID
    // 2. We don't have profile data yet
    // 3. We're not already fetching for this user ID
    if (
      user?.id &&
      !user.accountType &&
      profileFetchingRef.current !== user.id
    ) {
      profileFetchingRef.current = user.id; // Mark as fetching
      fetchUserProfile(user.id)
        .then((profile) => {
          profileFetchingRef.current = null; // Clear when done
          if (profile) {
            setUser((prev) =>
              prev
                ? {
                    ...prev,
                    accountType: profile.account_type as AccountType,
                    fullname: profile.fullname,
                    username: profile.username,
                    avatarUrl: profile.avatar_url,
                    role: profile.role,
                    approved: profile.approved,
                  }
                : null
            );
          }
        })
        .catch(() => {
          profileFetchingRef.current = null; // Clear on error too
        });
    } else if (!user?.id) {
      // Clear ref when user logs out
      profileFetchingRef.current = null;
    }
  }, [user?.id, user?.accountType]);

  // Periodically update expired user statuses (every 5 minutes when user is active)
  useEffect(() => {
    if (!user?.id) return;

    const updateExpiredStatuses = async () => {
      try {
        const response = await fetch("/api/user/update-expired-statuses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          console.log("[STATUS] Updated expired user statuses");
        } else {
          console.warn("[STATUS] Failed to update expired statuses");
        }
      } catch (error) {
        console.warn("[STATUS] Error updating expired statuses:", error);
      }
    };

    // Update immediately when user logs in
    updateExpiredStatuses();

    // Then update every 5 minutes
    const interval = setInterval(updateExpiredStatuses, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [user?.id]);

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

        // Set user status to Available when logged in (expires after 24 hours of inactivity)
        try {
          const expiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(); // 24 hours from now
          await setUserStatus("Available", "🟢", expiresAt);
        } catch (statusError) {
          console.error(
            "[AUTH] Failed to set available status on login:",
            statusError
          );
          // Don't fail login for this - it's not critical
        }
      }
    } finally {
      // Always clear the flag
      isCheckingApprovalRef.current = false;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      console.log("[AUTH] Logging out...");

      // Set user status to Offline before clearing state
      try {
        await setUserStatus("Offline", "⚫");
      } catch (statusError) {
        console.error(
          "[AUTH] Failed to set offline status on logout:",
          statusError
        );
        // Don't fail logout for this - it's not critical
      }

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
                role: profile.role,
                approved: profile.approved,
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
    [
      user,
      session,
      loading,
      handleSignUp,
      handleSignIn,
      handleLogout,
      handleRefreshProfile,
    ]
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
