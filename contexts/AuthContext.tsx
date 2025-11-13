"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { removeStorageItem } from "@/lib/utils/storage";
import { toast } from "sonner";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
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

  useEffect(() => {
    // Set up auth state listener - simple, like the working implementation
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[AUTH] Event:", _event);
      
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
            prev ? { ...prev, accountType: profile.account_type as AccountType, fullname: profile.fullname } : null
          );
        }
      });
    }
  }, [user?.id]);

  // Simple sign up handler
  const handleSignUp = async (
    email: string,
    password: string,
    accountType: AccountType,
    fullname?: string
  ) => {
    const { error } = await signUp(email, password, accountType, fullname);
    if (error) throw error;
    // User is auto-signed out after signup in signUp function
    // Set loading to false explicitly
    setLoading(false);
  };

  // Sign in handler with approval check
  const handleSignIn = async (email: string, password: string) => {
    const { error } = await signIn(email, password);
    if (error) throw error;
    
    // Check approval ONLY on explicit login (not on session restore)
    // This prevents timeout issues on page refresh
    const session = await supabase.auth.getSession();
    if (session.data.session?.user) {
      const profile = await fetchUserProfile(session.data.session.user.id);
      
      if (profile?.approved !== true) {
        // Not approved - sign out immediately
        await supabase.auth.signOut();
        throw new Error(
          "Your account is pending approval. An administrator will review your request."
        );
      }
      
      // Update user with full profile data
      setUser(buildAuthUser(session.data.session.user, profile));
    }
    // onAuthStateChange will handle the session
  };

  // Simple logout handler
  const handleLogout = async () => {
    await signOut();
    // Clear chat session from localStorage
    removeStorageItem("chatSessionId");
    // onAuthStateChange will clear user/session
  };

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
    <AuthContext.Provider
      value={{
        user,
        session,
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
