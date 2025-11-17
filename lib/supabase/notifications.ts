import { supabase } from "./client";

export interface Notification {
  id: string;
  userEmail: string;
  type:
    | "reminder_assigned"
    | "reminder_completed"
    | "reminder_updated"
    | "reminder_deleted";
  title: string;
  message: string;
  reminderId?: string;
  read: boolean;
  createdAt: Date;
}

// Database notification format (matches Supabase schema)
interface DatabaseNotification {
  id: string;
  user_email: string;
  type: string;
  title: string;
  message: string;
  reminder_id: string | null;
  read: boolean;
  created_at: string;
}

// Convert database notification to app notification format
function dbToAppNotification(
  dbNotification: DatabaseNotification
): Notification {
  return {
    id: dbNotification.id,
    userEmail: dbNotification.user_email,
    type: dbNotification.type as Notification["type"],
    title: dbNotification.title,
    message: dbNotification.message,
    reminderId: dbNotification.reminder_id || undefined,
    read: dbNotification.read,
    createdAt: new Date(dbNotification.created_at),
  };
}

/**
 * Get all notifications for the current user
 * Client-side implementation using Supabase directly
 */
export async function getNotifications(
  userEmail: string
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_email", userEmail.toLowerCase())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[NOTIFICATIONS] Error fetching notifications:", error);
      return [];
    }

    return (data || []).map(dbToAppNotification);
  } catch (error) {
    console.error("[NOTIFICATIONS] Exception fetching notifications:", error);
    return [];
  }
}

/**
 * Get unread notification count for the current user
 */
export async function getUnreadCount(userEmail: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", userEmail.toLowerCase())
      .eq("read", false);

    if (error) {
      console.error("[NOTIFICATIONS] Error fetching unread count:", error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error("[NOTIFICATIONS] Exception fetching unread count:", error);
    return 0;
  }
}

/**
 * Mark a single notification as read
 * Returns true on success, false on failure
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) {
      console.error(
        "[NOTIFICATIONS] Error marking notification as read:",
        error
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[NOTIFICATIONS] Exception marking notification as read:",
      error
    );
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 * Returns true on success, false on failure
 */
export async function markAllAsRead(userEmail: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_email", userEmail.toLowerCase())
      .eq("read", false);

    if (error) {
      console.error("[NOTIFICATIONS] Error marking all as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[NOTIFICATIONS] Exception marking all as read:", error);
    return false;
  }
}
