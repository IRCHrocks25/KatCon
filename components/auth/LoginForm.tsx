"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, UserPlus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AccountType } from "@/lib/supabase/auth";

export function LoginForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullname, setFullname] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("CRM");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, accountType, fullname.trim() || undefined);
        toast.success("Registration submitted!", {
          description: "Your account is pending approval. An administrator will review your request. Please try logging in once you've been approved.",
          duration: 7000,
        });
        // Clear fields after successful signup
        setEmail("");
        setPassword("");
        setFullname("");
        setAccountType("CRM");
        // Switch to sign in view after signup
        setIsSignUp(false);
        // User stays on login page (not redirected since they're not logged in)
      } else {
        // Sign in - will throw error if not approved
        await signIn(email, password);
        // If we reach here, user is approved and will be redirected to chat UI
        // No need for success toast - they'll see the UI
        setEmail("");
        setPassword("");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred. Please try again.";
      setError(errorMessage);
      
      // Show error toast
      toast.error(isSignUp ? "Registration failed" : "Sign in failed", {
        description: errorMessage,
      });
      // Don't clear fields on error so user can retry
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black flex items-center justify-center">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/15 via-pink-500/10 via-blue-500/10 to-orange-500/10" />

      {/* Auth Form */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-6" role="main" aria-labelledby="auth-title">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isSignUp ? "signup" : "signin"}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="text-center mb-8"
            >
              <h1 id="auth-title" className="text-2xl sm:text-3xl font-bold text-white mb-2">Katalyst Concierge</h1>
              <motion.p
                key={isSignUp ? "signup-text" : "signin-text"}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="text-gray-400 text-sm px-2 sm:px-0"
              >
                {isSignUp ? "Create your account" : "Welcome back"}
              </motion.p>
            </motion.div>
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-400 text-sm"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={isSignUp ? "signup-form" : "signin-form"}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleSubmit}
              className="space-y-4 sm:space-y-5"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
              >
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  placeholder="Enter your email"
                  disabled={loading}
                />
              </motion.div>

              {isSignUp && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: 0.125 }}
                  >
                    <label htmlFor="fullname" className="block text-sm font-medium text-gray-300 mb-2">
                      Full Name
                    </label>
                    <input
                      id="fullname"
                      type="text"
                      value={fullname}
                      onChange={(e) => setFullname(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                      placeholder="Enter your full name"
                      disabled={loading}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: 0.15 }}
                  >
                    <label htmlFor="accountType" className="block text-sm font-medium text-gray-300 mb-2">
                      Account Type <span id="accountType-required" className="text-red-400" aria-label="required">*</span>
                    </label>
                    <select
                      id="accountType"
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                      required
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                      disabled={loading}
                      aria-describedby="accountType-required"
                    >
                      <option value="CRM">CRM</option>
                      <option value="DEV">DEV</option>
                      <option value="PM">PM</option>
                      <option value="AI">AI</option>
                      <option value="DESIGN">DESIGN</option>
                      <option value="COPYWRITING">COPYWRITING</option>
                      <option value="OTHERS">OTHERS</option>
                    </select>
                  </motion.div>
                </>
              )}

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: isSignUp ? 0.15 : 0.125 }}
              >
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  placeholder="Enter your password"
                  disabled={loading}
                />
              </motion.div>

              <motion.button
                type="submit"
                disabled={loading}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 sm:py-4 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-base sm:text-base"
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                      aria-hidden="true"
                    />
                  ) : isSignUp ? (
                    <motion.div
                      key="signup"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2"
                    >
                      <UserPlus size={18} />
                      Sign Up
                    </motion.div>
                  ) : (
                    <motion.div
                      key="signin"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2"
                    >
                      <LogIn size={18} />
                      Sign In
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.form>
          </AnimatePresence>

          {/* Toggle Sign Up/Sign In */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setFullname("");
                setAccountType("CRM");
              }}
              className="text-sm text-gray-400 hover:text-white transition cursor-pointer"
              aria-label={isSignUp ? "Switch to sign in form" : "Switch to sign up form"}
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
