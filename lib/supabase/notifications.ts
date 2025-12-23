import { supabase } from "./client";
import { robustFetch } from "@/lib/utils/fetch";

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

/**
 * Update or create unread messages notification
 * This creates/updates a single notification showing total unread message count
 * Uses API route to handle database constraints and RLS policies
 */
export async function updateUnreadMessagesNotification(
  userEmail: string,
  unreadCount: number
): Promise<boolean> {
  try {
    if (!userEmail) {
      console.warn(
        "[NOTIFICATIONS] No user email provided for unread messages notification"
      );
      return false;
    }

    const headers = await getAuthHeaders();
    const response = await robustFetch(
      "/api/notifications/update-unread-messages",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ unreadCount }),
        retries: 2,
        timeout: 10000,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "[NOTIFICATIONS] Error updating unread messages notification:",
        {
          status: response.status,
          error: errorData.error,
          details: errorData.details,
        }
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[NOTIFICATIONS] Exception updating unread messages notification:",
      {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    );
    return false;
  }
}

/**
 * Get auth headers for API requests
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}
