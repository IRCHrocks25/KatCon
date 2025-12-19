"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Users, LogOut, User } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "@/components/auth/LoginForm";
import type { Reminder } from "@/lib/supabase/reminders";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@/lib/utils/storage";
import { AIChatView } from "@/components/chat/AIChatView";
import { MessagesView } from "@/components/messaging/MessagesView";
import { ProfileView } from "@/components/profile/ProfileView";

type TabType = "chat" | "messages" | "profile";

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Tab state with session storage persistence
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = getStorageItem("activeTab");
    return saved === "chat" || saved === "messages" || saved === "profile"
      ? (saved as TabType)
      : "chat";
  });

  // Track previous user ID to detect actual user changes
  const previousUserIdRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  // Persist tab selection
  useEffect(() => {
    setStorageItem("activeTab", activeTab);
  }, [activeTab]);

  // Clear data when user changes
  useEffect(() => {
    const currentUserId = user?.id || null;
    const previousUserId = previousUserIdRef.current;

    // Skip on initial mount
    if (isInitialMount.current) {
      previousUserIdRef.current = currentUserId;
      isInitialMount.current = false;
      return;
    }

    if (currentUserId !== previousUserId) {
      if (user) {
        // New user logged in - clear previous data
        Promise.resolve().then(() => {
          setReminders([]);
        });
      } else {
        // User logged out - clear everything
        Promise.resolve().then(() => {
          setReminders([]);
          removeStorageItem("chatSessionId");
        });
      }

      previousUserIdRef.current = currentUserId;
    }
  }, [user]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black flex flex-col">
      {/* Top Bar */}
      <div className="relative z-30 border-b border-gray-800/50 bg-gray-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "chat"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <MessageSquare size={18} />
              <span className="font-medium">AI Chat</span>
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "messages"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <Users size={18} />
              <span className="font-medium">Messages</span>
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "profile"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <User size={18} />
              <span className="font-medium">Profile</span>
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Notification Center */}
            <NotificationCenter />

            {/* Logout Button */}
            <button
              onClick={logout}
              disabled={authLoading}
              className="p-2 text-gray-400 hover:text-white transition flex items-center gap-2 text-sm bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-lg hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              title="Logout"
            >
              {authLoading ? (
                <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
              ) : (
                <LogOut size={16} />
              )}
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === "chat" ? -20 : activeTab === "messages" ? 20 : 0 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeTab === "chat" ? 20 : activeTab === "messages" ? -20 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-full h-full"
        >
          {activeTab === "chat" ? (
            <AIChatView reminders={reminders} setReminders={setReminders} />
          ) : activeTab === "messages" ? (
            <MessagesView reminders={reminders} setReminders={setReminders} />
          ) : (
            <ProfileView reminders={reminders} setReminders={setReminders} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
