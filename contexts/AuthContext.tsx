"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AccountType, AuthUser, onAuthStateChange, signIn, signOut, signUp, getSession } from "@/lib/supabase/auth";
import { toast } from "sonner";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, accountType: AccountType, fullname?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const previousUserRef = React.useRef<AuthUser | null>(null);
  const isInitialLoadRef = React.useRef(true);
  const userRef = React.useRef<AuthUser | null>(null);
  const loadingRef = React.useRef(true);
  const isIntentionalLogoutRef = React.useRef(false);

  // Keep refs in sync with state
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  React.useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    // Safety timeout to ensure loading doesn't hang forever
    const safetyTimeout = setTimeout(() => {
      if (loadingRef.current) {
        console.warn("[AUTH CONTEXT] Loading timeout - forcing loading to false");
        setLoading(false);
        // If callback hasn't fired, manually check session and set user to null
        if (isInitialLoadRef.current) {
          getSession().then((session) => {
            if (!session) {
              setUser(null);
              isInitialLoadRef.current = false;
            }
          }).catch(() => {
            setUser(null);
            isInitialLoadRef.current = false;
          });
        }
      }
    }, 5000); // 5 second safety timeout

    const { subscription } = onAuthStateChange((newUser) => {
      const previousUser = previousUserRef.current;
      const currentUser = userRef.current;
      
      // Clear safety timeout since callback was called
      clearTimeout(safetyTimeout);
      
      // Check if this is an unexpected sign-out (user was logged in, now logged out)
      // But not on initial load, not if user was already null, and not if it's an intentional logout
      if (
        !isInitialLoadRef.current &&
        previousUser !== null &&
        newUser === null &&
        currentUser !== null &&
        !isIntentionalLogoutRef.current
      ) {
        // Check if this might be due to approval status
        // We'll show a generic message since we can't easily distinguish the reason
        // The actual error message will come from signIn if they try to log in
        toast.error("Access denied", {
          description: "Your account may be pending approval or your session was revoked. Please contact support if you believe this is an error.",
          duration: 6000,
        });
      }

      // Reset intentional logout flag after handling the state change
      if (isIntentionalLogoutRef.current) {
        isIntentionalLogoutRef.current = false;
      }

      // Update refs
      previousUserRef.current = newUser;
      isInitialLoadRef.current = false;
      
      setUser(newUser);
      setLoading(false);
    });

    // Also check initial session immediately as a fallback
    // This ensures callback fires even if onAuthStateChange doesn't fire immediately
    getSession().then((session) => {
      // If we still haven't received a callback after a short delay, trigger it manually
      setTimeout(() => {
        if (isInitialLoadRef.current && loadingRef.current) {
          // onAuthStateChange should have fired by now, but if not, handle it
          if (!session) {
            setUser(null);
            setLoading(false);
            isInitialLoadRef.current = false;
          }
        }
      }, 100);
    }).catch(() => {
      // On error, ensure we don't hang
      if (isInitialLoadRef.current && loadingRef.current) {
        setUser(null);
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSignUp = async (email: string, password: string, accountType: AccountType, fullname?: string) => {
    await signUp(email, password, accountType, fullname);
    // User will be set via auth state change listener
  };

  const handleSignIn = async (email: string, password: string) => {
    await signIn(email, password);
    // User will be set via auth state change listener
  };

  const handleLogout = async () => {
    try {
      // Mark as intentional logout to prevent showing "Access denied" toast
      isIntentionalLogoutRef.current = true;
      await signOut();
      // Clear chat session from localStorage
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("chatSessionId");
      }
      // Don't show success toast on logout - user initiated it, no need to notify
    } catch (error) {
      // Reset flag on error
      isIntentionalLogoutRef.current = false;
      toast.error("Failed to logout", {
        description: error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp: handleSignUp,
        signIn: handleSignIn,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

