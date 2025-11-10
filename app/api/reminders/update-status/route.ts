import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    // Validate request body
    if (!id || !status) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "id and status are required",
        },
        { status: 400 }
      );
    }

    // Validate status
    if (!["pending", "done", "hidden"].includes(status)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          details: "Status must be 'pending', 'done', or 'hidden'",
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

    if (authError || !user || !user.email) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          details: "User not authenticated",
        },
        { status: 401 }
      );
    }

    // Update the reminder status
    // Using service role would bypass RLS, but we'll use the user's session
    // and handle RLS through the database function
    const { error } = await supabase
      .from("reminders")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.email);

    if (error) {
      console.error("Error updating reminder status:", error);
      return NextResponse.json(
        {
          error: "Failed to update reminder status",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Reminder status updated" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in update-status API route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

