import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moderateRateLimit } from "@/lib/utils/rate-limit";

interface ReminderAssignment {
  id: string;
  reminder_id: string;
  assignedto: string;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden";
  created_at: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET: Get all reminders for admin view (optionally filtered by user email)
export const GET = moderateRateLimit(async (request: NextRequest) => {
  try {
    // First, validate the admin user with their token
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userSupabase = createClient(supabaseUrl, supabaseServiceKey, {
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or manager
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Admin or Manager access required" },
        { status: 403 }
      );
    }

    // Use service role for admin operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get optional user email filter from query params
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail");

    let reminders: Array<{
      id: string;
      user_id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      status: string;
      position: number;
      last_status_change_at: string | null;
      snoozed_until: string | null;
      created_at: string;
      updated_at: string;
    }> = [];

    if (userEmail) {
      // For specific user: get reminders they created OR are assigned to (like regular user view)
      // Get reminder IDs where user is assigned
      const { data: assignedReminders } = await adminSupabase
        .from("reminder_assignments")
        .select("reminder_id")
        .eq("assignedto", userEmail)
        .neq("status", "hidden");

      const assignedReminderIds = assignedReminders?.map((a) => a.reminder_id) || [];

      // Get reminders where user is creator
      const { data: createdReminders, error: createdError } = await adminSupabase
        .from("reminders")
        .select("*")
        .eq("user_id", userEmail)
        .neq("status", "hidden");

      if (createdError) {
        console.error("Error fetching created reminders:", createdError);
      }

      // Combine and deduplicate reminders
      const allReminders = [...(createdReminders || []), ...(assignedReminders ? [] : [])];
      const uniqueReminders = Array.from(
        new Map(allReminders.map((r) => [r.id, r])).values()
      );

      // If user has assigned reminders, fetch those too
      if (assignedReminderIds.length > 0) {
        const { data: assignedRemindersData, error: assignedError } = await adminSupabase
          .from("reminders")
          .select("*")
          .in("id", assignedReminderIds)
          .neq("status", "hidden");

        if (!assignedError && assignedRemindersData) {
          // Add assigned reminders, avoiding duplicates
          for (const assignedReminder of assignedRemindersData) {
            if (!uniqueReminders.some((r) => r.id === assignedReminder.id)) {
              uniqueReminders.push(assignedReminder);
            }
          }
        }
      }

      reminders = uniqueReminders;
    } else {
      // No user filter: fetch all reminders for admin overview
      const { data: allReminders, error: remindersError } = await adminSupabase
        .from("reminders")
        .select("*")
        .neq("status", "hidden")
        .order("created_at", { ascending: false });

      if (remindersError) {
        console.error("Error fetching all reminders:", remindersError);
        return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
      }

      reminders = allReminders || [];
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ reminders: [] });
    }

    // Fetch all assignments for these reminders
    const reminderIds = reminders.map((r) => r.id);
    const { data: allAssignments, error: assignmentsError } = await adminSupabase
      .from("reminder_assignments")
      .select("*")
      .in("reminder_id", reminderIds);

    if (assignmentsError) {
      console.error("Error fetching assignments:", assignmentsError);
    }

    // Group assignments by reminder_id
    const assignmentsByReminder = new Map<string, ReminderAssignment[]>();
    (allAssignments || []).forEach((assignment: ReminderAssignment) => {
      const existing = assignmentsByReminder.get(assignment.reminder_id) || [];
      existing.push(assignment);
      assignmentsByReminder.set(assignment.reminder_id, existing);
    });

    // Convert to app format
    const formattedReminders = reminders.map((reminder) => {
      const assignments = assignmentsByReminder.get(reminder.id) || [];
      return {
        id: reminder.id,
        title: reminder.title,
        description: reminder.description || undefined,
        dueDate: reminder.due_date ? new Date(reminder.due_date) : undefined,
        status: reminder.status as "backlog" | "in_progress" | "review" | "done" | "hidden",
        position: reminder.position || 0,
        lastStatusChangeAt: reminder.last_status_change_at ? new Date(reminder.last_status_change_at) : undefined,
        snoozedUntil: reminder.snoozed_until ? new Date(reminder.snoozed_until) : undefined,
        createdBy: reminder.user_id, // Email of creator
        assignedTo: assignments.map((a) => a.assignedto).filter(Boolean),
      };
    });

    return NextResponse.json({ reminders: formattedReminders });
  } catch (error) {
    console.error("Error in admin reminders GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
