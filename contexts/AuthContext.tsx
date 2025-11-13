"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  AccountType,
  AuthUser,
  onAuthStateChange,
  signIn,
  signOut,
  signUp,
  getSession,
} from "@/lib/supabase/auth";
import { removeStorageItem } from "@/lib/utils/storage";
import { toast } from "sonner";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, accountType: AccountType, fullname?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Track previous user to detect unexpected sign-outs
  const previousUserRef = useRef<AuthUser | null>(null);
  
  // Track current user for comparison (avoid stale closures)
  const currentUserRef = useRef<AuthUser | null>(null);
  
  // Track intentional logout to suppress "Access denied" toast
  const isIntentionalLogoutRef = useRef(false);
  
  // Track if this is the initial load
  const isInitialLoadRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Restore session immediately on mount
    const initializeAuth = async () => {
      try {
        // Small delay to ensure localStorage is ready after cached page load
        // This handles cases where browser loads page from cache
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        const session = await getSession();
        
        // If no session, set loading to false immediately
        if (!session && mounted) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      } catch (error) {
        // On error, ensure we don't hang
        if (mounted) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    };

    // Set up auth state change listener
    const { subscription: authSubscription } = onAuthStateChange((newUser) => {
      if (!mounted) return;

      const previousUser = previousUserRef.current;

      // Check if this is an unexpected sign-out
      // Only show toast if:
      // - Not initial load
      // - User was previously logged in
      // - User is now logged out
      // - Not an intentional logout
      if (
        !isInitialLoadRef.current &&
        previousUser !== null &&
        newUser === null &&
        currentUserRef.current !== null &&
        !isIntentionalLogoutRef.current
      ) {
        toast.error("Access denied", {
          description:
            "Your account may be pending approval or your session was revoked. Please contact support if you believe this is an error.",
          duration: 6000,
        });
      }

      // Reset intentional logout flag after handling the state change
      if (isIntentionalLogoutRef.current) {
        isIntentionalLogoutRef.current = false;
      }

      // Update state
      previousUserRef.current = newUser;
      isInitialLoadRef.current = false;
      setUser(newUser);
      setLoading(false);
    });

    subscription = authSubscription;

    // Initialize auth state
    initializeAuth();

    // Cleanup
    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []); // Empty deps - only run on mount

  // Memoized sign up handler
  const handleSignUp = useCallback(
    async (email: string, password: string, accountType: AccountType, fullname?: string) => {
      await signUp(email, password, accountType, fullname);
      // Force set user to null after signup (user needs approval)
      setUser(null);
      setLoading(false);
    },
    []
  );

  // Memoized sign in handler
  const handleSignIn = useCallback(async (email: string, password: string) => {
    // signIn will throw error if user is not approved
    // Only succeeds if user is approved
    await signIn(email, password);
    // User will be set via auth state change listener (only for approved users)
  }, []);

  // Memoized logout handler
  const handleLogout = useCallback(async () => {
    try {
      // Mark as intentional logout to prevent showing "Access denied" toast
      isIntentionalLogoutRef.current = true;
      await signOut();
      
      // Clear chat session from localStorage
      removeStorageItem("chatSessionId");
      
      // Don't show success toast on logout - user initiated it
    } catch (error) {
      // Reset flag on error
      isIntentionalLogoutRef.current = false;
      toast.error("Failed to logout", {
        description: error instanceof Error ? error.message : "An error occurred",
      });
    }
  }, []);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      signUp: handleSignUp,
      signIn: handleSignIn,
      logout: handleLogout,
    }),
    [user, loading, handleSignUp, handleSignIn, handleLogout]
  );

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
