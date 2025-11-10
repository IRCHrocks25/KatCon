import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    // Validate request body
    if (!id) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "id is required",
        },
        { status: 400 }
      );
    }

    // Get authorization token from header
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          details: "No authorization token provided",
        },
        { status: 401 }
      );
    }

    // Create Supabase client with the access token
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    // Get the current user using the token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          details: "User not authenticated",
        },
        { status: 401 }
      );
    }

    // Use the RPC function to update status to 'hidden' (bypasses RLS issues)
    const { error } = await supabase.rpc("update_reminder_status", {
      reminder_id: id,
      new_status: "hidden",
    });

    if (error) {
      // Fallback to direct update if RPC function doesn't exist
      console.warn("RPC function failed, trying direct update:", error);
      
      if (!user.email) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            details: "User email not available",
          },
          { status: 401 }
        );
      }

      const { error: updateError } = await supabase
        .from("reminders")
        .update({ status: "hidden" })
        .eq("id", id)
        .eq("user_id", user.email);

      if (updateError) {
        console.error("Error deleting reminder:", updateError);
        return NextResponse.json(
          {
            error: "Failed to delete reminder",
            details: updateError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: true, message: "Reminder deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in delete API route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

