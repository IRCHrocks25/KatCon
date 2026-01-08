"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  MessageSquare,
  Users,
  LogOut,
  User,
  KanbanSquare,
  Shield,
  Menu,
  X,
} from "lucide-react";
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
import { ProfileView } from "@/components/profile/ProfileView";
import { KanbanView } from "@/components/kanban/KanbanView";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { RemindersModal } from "@/components/reminders/RemindersModal";
import { LogoutConfirmationModal } from "@/components/ui/LogoutConfirmationModal";

// Lazy load heavy components
const MessagesView = lazy(() => import("@/components/messaging/MessagesView"));

type TabType = "chat" | "messages" | "kanban" | "profile" | "admin";

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [initialEditingReminder, setInitialEditingReminder] = useState<Reminder | null>(null);
  const [forceShowCreateForm, setForceShowCreateForm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);

  // Tab state with session storage persistence
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = getStorageItem("activeTab");
    return saved === "chat" ||
      saved === "messages" ||
      saved === "kanban" ||
      saved === "profile" ||
      saved === "admin"
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
          {/* Mobile Menu Button */}
          <button
            onClick={() => setShowMobileNav(!showMobileNav)}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition cursor-pointer"
            title="Toggle navigation"
          >
            {showMobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Desktop Tabs */}
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
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
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "messages"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <Users size={18} />
              <span className="font-medium">Messages</span>
            </button>
            <button
              onClick={() => setActiveTab("kanban")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "kanban"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <KanbanSquare size={18} />
              <span className="font-medium">Kanban</span>
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "profile"
                  ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border-b-2 border-purple-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <User size={18} />
              <span className="font-medium">Profile</span>
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => setActiveTab("admin")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === "admin"
                    ? "bg-gradient-to-r from-red-600/20 via-orange-500/20 to-yellow-500/20 text-white border-b-2 border-red-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <Shield size={18} />
                <span className="font-medium">Admin</span>
              </button>
            )}
          </div>

          {/* Mobile Active Tab Indicator */}
          <div className="lg:hidden flex items-center gap-2">
            {activeTab === "chat" && <MessageSquare size={18} className="text-purple-400" />}
            {activeTab === "messages" && <Users size={18} className="text-purple-400" />}
            {activeTab === "kanban" && <KanbanSquare size={18} className="text-purple-400" />}
            {activeTab === "profile" && <User size={18} className="text-purple-400" />}
            {activeTab === "admin" && <Shield size={18} className="text-red-400" />}
            <span className="text-white font-medium capitalize">
              {activeTab === "chat" ? "AI Chat" :
               activeTab === "messages" ? "Messages" :
               activeTab === "kanban" ? "Kanban" :
               activeTab === "profile" ? "Profile" : "Admin"}
            </span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Notification Center */}
            <NotificationCenter
              onTabChange={setActiveTab}
              onOpenTask={() => {
                // For now, just switch to kanban tab
                // In the future, we could open a task details modal
                setActiveTab("kanban");
              }}
            />

            {/* Logout Button */}
            <button
              onClick={() => setShowLogoutModal(true)}
              disabled={authLoading}
              className="p-2 text-gray-400 hover:text-white transition cursor-pointer flex items-center gap-2 text-sm bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-lg hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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

        {/* Mobile Navigation Overlay */}
        {showMobileNav && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2">
              <button
                onClick={() => {
                  setActiveTab("chat");
                  setShowMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                  activeTab === "chat"
                    ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <MessageSquare size={20} />
                <span className="font-medium">AI Chat</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("messages");
                  setShowMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                  activeTab === "messages"
                    ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <Users size={20} />
                <span className="font-medium">Messages</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("kanban");
                  setShowMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                  activeTab === "kanban"
                    ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <KanbanSquare size={20} />
                <span className="font-medium">Kanban</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("profile");
                  setShowMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                  activeTab === "profile"
                    ? "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 text-white border border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <User size={20} />
                <span className="font-medium">Profile</span>
              </button>
              {user?.role === "admin" && (
                <button
                  onClick={() => {
                    setActiveTab("admin");
                    setShowMobileNav(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                    activeTab === "admin"
                      ? "bg-gradient-to-r from-red-600/20 via-orange-500/20 to-yellow-500/20 text-white border border-red-500"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  <Shield size={20} />
                  <span className="font-medium">Admin</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full h-full"
        >
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              </div>
            }
          >
            {activeTab === "chat" ? (
              <AIChatView reminders={reminders} setReminders={setReminders} />
            ) : activeTab === "messages" ? (
              <MessagesView reminders={reminders} setReminders={setReminders} />
            ) : activeTab === "kanban" ? (
              <KanbanView
                reminders={reminders}
                setReminders={setReminders}
                onOpenTaskModal={(editingReminder) => {
                  setInitialEditingReminder(editingReminder || null);
                  setForceShowCreateForm(!editingReminder); // Force create form if no editing reminder
                  setShowRemindersModal(true);
                }}
              />
            ) : activeTab === "profile" ? (
              <ProfileView />
            ) : activeTab === "admin" ? (
              <AdminDashboard />
            ) : null}
          </Suspense>
        </motion.div>
      </div>

      {/* Reminders Modal */}
      <RemindersModal
        isOpen={showRemindersModal}
        onClose={() => {
          setShowRemindersModal(false);
          setInitialEditingReminder(null);
          setForceShowCreateForm(false);
        }}
        reminders={reminders}
        setReminders={setReminders}
        initialShowForm={!!initialEditingReminder}
        initialEditingReminder={initialEditingReminder}
        forceShowCreateForm={forceShowCreateForm}
      />

      {/* Logout Confirmation Modal */}
      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          setShowLogoutModal(false);
          logout();
        }}
        isLoggingOut={authLoading}
      />
    </div>
  );
}
