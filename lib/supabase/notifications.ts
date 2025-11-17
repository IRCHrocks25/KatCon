import { supabase } from "./client";
import { getUserEmail } from "./session";

const isDev = process.env.NODE_ENV === "development";

export type NotificationType =
  | "reminder_assigned"
  | "reminder_completed"
  | "reminder_updated"
  | "reminder_deleted";

export interface Notification {
  id: string;
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  reminderId?: string;
  read: boolean;
  createdAt: Date;
}

// Database notification format
interface DatabaseNotification {
  id: string;
  user_email: string;
  type: NotificationType;
  title: string;
  message: string;
  reminder_id: string | null;
  read: boolean;
  created_at: string;
}

// DTO for creating notifications
export interface CreateNotificationDto {
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  reminderId?: string;
}

// Convert database notification to app notification format
function dbToAppNotification(
  dbNotification: DatabaseNotification
): Notification {
  return {
    id: dbNotification.id,
    userEmail: dbNotification.user_email,
    type: dbNotification.type,
    title: dbNotification.title,
    message: dbNotification.message,
    reminderId: dbNotification.reminder_id || undefined,
    read: dbNotification.read,
    createdAt: new Date(dbNotification.created_at),
  };
}

/**
 * Get all notifications for a user, ordered by created_at DESC
 */
export async function getNotifications(
  userEmail?: string
): Promise<Notification[]> {
  const email = userEmail || (await getUserEmail());
  if (!email) {
    if (isDev) console.warn("[NOTIFICATIONS] User not authenticated");
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      if (isDev)
        console.error("[NOTIFICATIONS] Error fetching notifications:", error);
      return [];
    }

    return (data || []).map(dbToAppNotification);
  } catch (error) {
    if (isDev)
      console.error("[NOTIFICATIONS] Exception fetching notifications:", error);
    return [];
  }
}

/**
 * Get count of unread notifications for a user
 */
export async function getUnreadCount(userEmail?: string): Promise<number> {
  const email = userEmail || (await getUserEmail());
  if (!email) {
    return 0;
  }

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("read", false);

    if (error) {
      if (isDev)
        console.error("[NOTIFICATIONS] Error fetching unread count:", error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    if (isDev)
      console.error("[NOTIFICATIONS] Exception fetching unread count:", error);
    return 0;
  }
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) {
      if (isDev) console.error("[NOTIFICATIONS] Error marking as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    if (isDev)
      console.error("[NOTIFICATIONS] Exception marking as read:", error);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userEmail?: string): Promise<boolean> {
  const email = userEmail || (await getUserEmail());
  if (!email) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_email", email)
      .eq("read", false);

    if (error) {
      if (isDev)
        console.error("[NOTIFICATIONS] Error marking all as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    if (isDev)
      console.error("[NOTIFICATIONS] Exception marking all as read:", error);
    return false;
  }
}

/**
 * Create a new notification (server-side only, uses service role)
 */
export async function createNotification(
  notification: CreateNotificationDto
): Promise<Notification | null> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_email: notification.userEmail,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        reminder_id: notification.reminderId || null,
        read: false,
      })
      .select()
      .single();

    if (error) {
      if (isDev)
        console.error("[NOTIFICATIONS] Error creating notification:", error);
      return null;
    }

    return dbToAppNotification(data);
  } catch (error) {
    if (isDev)
      console.error("[NOTIFICATIONS] Exception creating notification:", error);
    return null;
  }
}
