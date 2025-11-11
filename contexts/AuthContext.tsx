"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AccountType, AuthUser, onAuthStateChange, signIn, signOut, signUp } from "@/lib/supabase/auth";
import { toast } from "sonner";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, accountType: AccountType) => Promise<void>;
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
      }
    }, 5000); // 5 second safety timeout

    const { subscription } = onAuthStateChange((newUser) => {
      const previousUser = previousUserRef.current;
      const currentUser = userRef.current;
      
      // Clear safety timeout since callback was called
      clearTimeout(safetyTimeout);
      
      // Check if this is an unexpected sign-out (user was logged in, now logged out)
      // But not on initial load and not if user was already null
      if (
        !isInitialLoadRef.current &&
        previousUser !== null &&
        newUser === null &&
        currentUser !== null
      ) {
        // Session expired unexpectedly
        toast.error("Session expired", {
          description: "Your session has expired. Please sign in again.",
          duration: 5000,
        });
      }

      // Update refs
      previousUserRef.current = newUser;
      isInitialLoadRef.current = false;
      
      setUser(newUser);
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSignUp = async (email: string, password: string, accountType: AccountType) => {
    await signUp(email, password, accountType);
    // User will be set via auth state change listener
  };

  const handleSignIn = async (email: string, password: string) => {
    await signIn(email, password);
    // User will be set via auth state change listener
  };

  const handleLogout = async () => {
    try {
      await signOut();
      // Clear chat session from localStorage
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("chatSessionId");
      }
      toast.success("Logged out successfully");
    } catch (error) {
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

