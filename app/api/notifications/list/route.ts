import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(request: NextRequest) {
  try {
    // Get auth header from request
    const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
    console.log("[NOTIFICATIONS API] Auth header present:", !!authHeader);
    
    if (!authHeader) {
      console.error("[NOTIFICATIONS API] No auth header found");
      return NextResponse.json(
        { error: "Unauthorized", notifications: [] },
        { status: 401 }
      );
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "").trim();
    console.log("[NOTIFICATIONS API] Token extracted, length:", token.length);

    // Create anon client to verify the user's token
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log("[NOTIFICATIONS API] Verifying user token...");

    // Verify the token and get user
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    
    console.log("[NOTIFICATIONS API] Token verification result:", {
      hasUser: !!user,
      userEmail: user?.email,
      error: authError?.message,
    });
    
    if (authError || !user?.email) {
      console.error("[NOTIFICATIONS API] Token verification failed:", authError?.message || "No user email");
      return NextResponse.json(
        { error: "Unauthorized", notifications: [] },
        { status: 401 }
      );
    }

    console.log("[NOTIFICATIONS API] Fetching notifications for:", user.email);

    // Use service role key for database query (bypasses RLS)
    if (!supabaseServiceRoleKey) {
      console.error("[NOTIFICATIONS API] Service role key not configured");
      return NextResponse.json(
        { error: "Server configuration error", notifications: [] },
        { status: 500 }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Fetch notifications for user
    const { data, error } = await serviceClient
      .from("notifications")
      .select("*")
      .eq("user_email", user.email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[NOTIFICATIONS API] Error fetching notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications", notifications: [] },
        { status: 500 }
      );
    }

    console.log("[NOTIFICATIONS API] Successfully fetched notifications:", data?.length || 0);
    return NextResponse.json({ notifications: data || [] });
  } catch (error) {
    console.error("[NOTIFICATIONS API] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error", notifications: [] },
      { status: 500 }
    );
  }
}

