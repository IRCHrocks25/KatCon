"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/supabase/notifications";

interface NotificationCenterProps {
  onTabChange?: (tab: "chat" | "messages" | "kanban" | "profile") => void;
  onOpenTask?: (taskId: string) => void;
}

export function NotificationCenter({ onTabChange, onOpenTask }: NotificationCenterProps = {}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications (client-side, same pattern as reminders)
  const fetchNotifications = async () => {
    if (!user?.email) {
      console.warn("[NOTIFICATIONS] No user email, skipping fetch");
      return;
    }

    try {
      console.log(
        "[NOTIFICATIONS] Fetching notifications for user:",
        user?.email
      );

      const fetchedNotifications = await getNotifications(user.email);
      console.log(
        "[NOTIFICATIONS] Fetched notifications count:",
        fetchedNotifications.length
      );

      setNotifications(fetchedNotifications);
      setUnreadCount(fetchedNotifications.filter((n) => !n.read).length);
      console.log(
        "[NOTIFICATIONS] State updated, unread count:",
        fetchedNotifications.filter((n) => !n.read).length
      );
    } catch (error) {
      console.error("[NOTIFICATIONS] Exception during fetch:", error);
    }
  };

  // Mark notification as read (client-side)
  const handleMarkAsRead = async (notificationId: string) => {
    setMarkingReadId(notificationId);
    try {
      const success = await markAsRead(notificationId);
      if (success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else {
        toast.error("Failed to mark notification as read");
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Failed to mark notification as read");
    } finally {
      setMarkingReadId(null);
    }
  };

  // Mark all as read (client-side)
  const handleMarkAllAsRead = async () => {
    if (!user?.email) {
      console.warn("[NOTIFICATIONS] No user email, cannot mark all as read");
      return;
    }

    setMarkingAllRead(true);
    try {
      const success = await markAllAsRead(user.email);
      if (success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        toast.success("All notifications marked as read");
      } else {
        toast.error("Failed to mark all as read");
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Failed to mark all as read");
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Handle notification click - redirect based on type
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read first
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Close dropdown
    setIsOpen(false);

    console.log('Notification click:', {
      type: notification.type,
      title: notification.title,
      message: notification.message
    });

    // Redirect based on notification type or title
    if (notification.type.startsWith('reminder_') && notification.title !== 'New Messages') {
      // Reminder notifications - go to kanban tab
      console.log('Redirecting to Kanban for reminder notification');
      onTabChange?.('kanban');

      // If there's a specific task, open it
      if (notification.reminderId && onOpenTask) {
        // Small delay to allow tab switch
        setTimeout(() => {
          onOpenTask(notification.reminderId!);
        }, 100);
      }
    } else if (notification.type === 'unread_messages' || notification.title === 'New Messages') {
      // Unread messages - go to messages tab
      console.log('Redirecting to Messages for unread messages notification');
      onTabChange?.('messages');
    } else if (notification.type.startsWith('reminder_')) {
      // Other reminder notifications - go to kanban tab
      console.log('Redirecting to Kanban for other reminder notification');
      onTabChange?.('kanban');

      // If there's a specific task, open it
      if (notification.reminderId && onOpenTask) {
        // Small delay to allow tab switch
        setTimeout(() => {
          onOpenTask(notification.reminderId!);
        }, 100);
      }
    } else {
      console.log('No redirect for notification type:', notification.type, 'title:', notification.title);
    }
  };

  // Format relative time
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "reminder_assigned":
        return "📋";
      case "reminder_completed":
        return "✅";
      case "reminder_updated":
        return "✏️";
      case "reminder_deleted":
        return "🗑️";
      case "unread_messages":
        return "💬";
      default:
        return "🔔";
    }
  };

  // Fetch notifications on mount only
  // Real-time subscription keeps the data fresh, no need to refetch on dropdown open
  useEffect(() => {
    if (user?.email) {
      fetchNotifications();
    }
  }, [user?.email]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!user?.email) {
      console.warn(
        "[NOTIFICATIONS] No user email, skipping realtime subscription"
      );
      return;
    }

    console.log(
      "[NOTIFICATIONS] Setting up realtime subscription for:",
      user.email
    );

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          console.log("[NOTIFICATIONS] 🔔 New notification received:", payload);
          console.log("[NOTIFICATIONS] Payload details:", {
            id: payload.new.id,
            type: payload.new.type,
            user_email: payload.new.user_email,
            title: payload.new.title,
            message: payload.new.message,
          });

          // Verify this notification is for the current user (client-side filtering)
          const notificationEmail = payload.new.user_email?.toLowerCase();
          const currentUserEmail = user?.email?.toLowerCase();

          if (notificationEmail !== currentUserEmail) {
            console.log("[NOTIFICATIONS] Notification not for current user, ignoring");
            return;
          }

          // Add new notification to state
          const newNotification: Notification = {
            id: payload.new.id,
            userEmail: payload.new.user_email,
            type: payload.new.type,
            title: payload.new.title,
            message: payload.new.message,
            reminderId: payload.new.reminder_id,
            read: payload.new.read,
            createdAt: new Date(payload.new.created_at),
          };

          // Check if notification already exists to avoid duplicates
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === newNotification.id);
            if (exists) {
              console.log(
                "[NOTIFICATIONS] Notification already exists, skipping state update"
              );
              return prev;
            }
            return [newNotification, ...prev];
          });

          setUnreadCount((prev) => prev + 1);
          console.log("[NOTIFICATIONS] State updated with new notification");

          // Show toast notification - always show for all notifications received via realtime
          // Use setTimeout to ensure toast shows even if state update is delayed
          setTimeout(() => {
            try {
              console.log("[NOTIFICATIONS] Showing toast for:", {
                title: newNotification.title,
                message: newNotification.message,
                type: newNotification.type,
              });
              toast.info(newNotification.title, {
                description: newNotification.message,
                duration: 5000,
              });
              console.log("[NOTIFICATIONS] ✅ Toast shown successfully");
            } catch (error) {
              console.error("[NOTIFICATIONS] ❌ Error showing toast:", error);
            }
          }, 100);
        }
      )
      .subscribe((status) => {
        console.log("[NOTIFICATIONS] Realtime subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log(
            "[NOTIFICATIONS] ✅ Successfully subscribed to notifications"
          );
        } else if (status === "CHANNEL_ERROR") {
          console.error("[NOTIFICATIONS] ❌ Channel subscription error");
        }
      });

    return () => {
      console.log("[NOTIFICATIONS] Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [user?.email]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition cursor-pointer flex items-center gap-2 text-sm bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-lg hover:border-gray-700"
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-96 bg-gray-900/95 backdrop-blur-sm border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={markingAllRead}
                  className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {markingAllRead ? (
                    <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                  ) : (
                    <CheckCheck size={12} />
                  )}
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-4 hover:bg-gray-800/50 transition cursor-pointer ${
                        !notification.read ? "bg-purple-900/10" : ""
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="text-white text-sm font-medium">
                                {notification.title}
                              </h4>
                              <p className="text-gray-400 text-xs mt-1">
                                {notification.message}
                              </p>
                              <p className="text-gray-600 text-xs mt-1">
                                {formatRelativeTime(notification.createdAt)}
                              </p>
                            </div>

                            {/* Mark as read button */}
                            {!notification.read && (
                              <button
                                onClick={() =>
                                  handleMarkAsRead(notification.id)
                                }
                                disabled={markingReadId === notification.id}
                                className="flex-shrink-0 p-1 text-gray-500 hover:text-purple-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Mark as read"
                              >
                                {markingReadId === notification.id ? (
                                  <div className="w-3 h-3 border border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
