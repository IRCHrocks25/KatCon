import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    // Use service role key for server-side operations (bypasses RLS like reminders API)
    const supabase = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })
      : createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        });

    // Get user info from token for validation
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { unreadCount } = body;

    if (typeof unreadCount !== "number" || unreadCount < 0) {
      return NextResponse.json(
        { error: "Invalid unreadCount" },
        { status: 400 }
      );
    }

    // Get user email from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (!profile?.email) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const userEmail = profile.email.toLowerCase();

    // Check for existing unread message notifications (check by title to catch all types)
    // This handles cases where type might be "reminder_assigned" as fallback
    const { data: existingNotifications, error: fetchError } = await supabase
      .from("notifications")
      .select("id, type, created_at")
      .eq("user_email", userEmail)
      .eq("title", "New Messages")
      .eq("read", false)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("[NOTIFICATIONS API] Error fetching existing notification:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch existing notification" },
        { status: 500 }
      );
    }

    const message = unreadCount === 1 
      ? "You have 1 unread message" 
      : `You have ${unreadCount} unread messages`;

    if (unreadCount === 0) {
      // If no unread messages, mark ALL existing unread message notifications as read
      if (existingNotifications && existingNotifications.length > 0) {
        const notificationIds = existingNotifications.map((n) => n.id);
        const { error: updateError } = await supabase
          .from("notifications")
          .update({ read: true })
          .in("id", notificationIds);

        if (updateError) {
          console.error("[NOTIFICATIONS API] Error marking notifications as read:", updateError);
          return NextResponse.json(
            { error: "Failed to update notifications" },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ success: true });
    }

    // Mark all existing unread message notifications as read first (to avoid duplicates)
    if (existingNotifications && existingNotifications.length > 1) {
      // If there are multiple, mark all but the most recent one as read
      // They're already sorted by created_at desc from the query
      const toMarkAsRead = existingNotifications.slice(1); // All except the first (most recent) one
      if (toMarkAsRead.length > 0) {
        const notificationIds = toMarkAsRead.map((n) => n.id);
        await supabase
          .from("notifications")
          .update({ read: true })
          .in("id", notificationIds);
      }
    }

    // Update the most recent notification or create a new one
    if (existingNotifications && existingNotifications.length > 0) {
      // Update the most recent notification (first in the sorted array)
      const latestNotification = existingNotifications[0];
      
      const { error: updateError } = await supabase
        .from("notifications")
        .update({
          message,
          created_at: new Date().toISOString(),
          read: false,
        })
        .eq("id", latestNotification.id);

      if (updateError) {
        console.error("[NOTIFICATIONS API] Error updating notification:", updateError);
        return NextResponse.json(
          { error: "Failed to update notification" },
          { status: 500 }
        );
      }
    } else {
      // Create new notification - use reminder_assigned type since unread_messages is not in database constraint
      const { error: insertError } = await supabase
        .from("notifications")
        .insert({
          user_email: userEmail,
          type: "reminder_assigned",
          title: "New Messages",
          message,
          reminder_id: null,
          read: false,
        });

      if (insertError) {
        console.error("[NOTIFICATIONS API] Error creating notification:", {
          error: insertError,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });

        return NextResponse.json(
          { error: "Failed to create notification", details: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NOTIFICATIONS API] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
