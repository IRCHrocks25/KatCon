import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: NextRequest) {
  try {
    // Get auth header from request
    const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 401 }
      );
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "").trim();

    // Create anon client to verify the user's token
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify the token and get user
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    
    if (authError || !user?.email) {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 401 }
      );
    }

    // Use service role key for database operations (bypasses RLS)
    if (!supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error", success: false },
        { status: 500 }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();
    const { notificationId, markAll } = body;

    if (markAll) {
      // Mark all notifications as read for user
      const { error } = await serviceClient
        .from("notifications")
        .update({ read: true })
        .eq("user_email", user.email)
        .eq("read", false);

      if (error) {
        console.error("Error marking all as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notifications as read", success: false },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } else if (notificationId) {
      // Mark single notification as read
      const { error } = await serviceClient
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId)
        .eq("user_email", user.email); // Ensure user owns this notification

      if (error) {
        console.error("Error marking notification as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notification as read", success: false },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Missing notificationId or markAll parameter", success: false },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error in notifications/mark-read API route:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}

