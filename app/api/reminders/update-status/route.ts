import { NextRequest, NextResponse } from "next/server";
import { moderateRateLimit } from "@/lib/utils/rate-limit";

export const POST = moderateRateLimit(async (request: NextRequest) => {
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
    if (!["backlog", "in_progress", "review", "done", "hidden"].includes(status)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          details: "Status must be 'backlog', 'in_progress', 'review', 'done', or 'hidden'",
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

    // Check if user is creator or assigned to this reminder
    const { data: reminder, error: reminderError } = await supabase
      .from("reminders")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (reminderError || !reminder) {
      return NextResponse.json(
        {
          error: "Reminder not found",
          details: "The reminder does not exist",
        },
        { status: 404 }
      );
    }

    const isCreator = reminder.user_id === user.email;

    // Check if user is assigned to this reminder
    const { data: assignment } = await supabase
      .from("reminder_assignments")
      .select("id, status")
      .eq("reminder_id", id)
      .eq("assignedto", user.email.toLowerCase())
      .single();

    const isAssigned = !!assignment;

    if (!isCreator && !isAssigned) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          details: "You are not authorized to update this reminder",
        },
        { status: 403 }
      );
    }

    // Creators have full control over their tasks
    if (isCreator) {
      // If user is creator, update the reminder status directly and sync all assignments
      const { error: reminderUpdateError } = await supabase
        .from("reminders")
        .update({ status, last_status_change_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.email);

      if (reminderUpdateError) {
        console.error("Error updating reminder status:", reminderUpdateError);
        return NextResponse.json(
          {
            error: "Failed to update reminder status",
            details: reminderUpdateError.message,
          },
          { status: 500 }
        );
      }

      // Sync all assignment statuses to match the overall status
      const { error: assignmentsUpdateError } = await supabase
        .from("reminder_assignments")
        .update({ status })
        .eq("reminder_id", id);

      if (assignmentsUpdateError) {
        console.error("Error syncing assignment statuses:", assignmentsUpdateError);
        // Don't fail the request - reminder update succeeded
      }
    } else if (isAssigned) {
      // If user is assigned (but not creator), update their individual assignment status
      const { error: assignmentUpdateError } = await supabase
        .from("reminder_assignments")
        .update({ status })
        .eq("id", assignment.id);

      if (assignmentUpdateError) {
        console.error("Error updating assignment status:", assignmentUpdateError);
        return NextResponse.json(
          {
            error: "Failed to update reminder status",
            details: assignmentUpdateError.message,
          },
          { status: 500 }
        );
      }

      // Also update the overall reminder status when an assignee updates
      const { error: reminderUpdateError } = await supabase
        .from("reminders")
        .update({ status, last_status_change_at: new Date().toISOString() })
        .eq("id", id);

      if (reminderUpdateError) {
        console.error("Error updating reminder status:", reminderUpdateError);
        // Don't fail - assignment update succeeded
      }
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
});
