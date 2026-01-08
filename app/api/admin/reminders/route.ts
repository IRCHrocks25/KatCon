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

    // Check if user is admin
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Use service role for admin operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get optional user email filter from query params
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail");

    // Fetch all reminders (or filtered by user email)
    let remindersQuery = adminSupabase
      .from("reminders")
      .select("*")
      .neq("status", "hidden");

    if (userEmail) {
      remindersQuery = remindersQuery.eq("user_id", userEmail);
    }

    const { data: reminders, error: remindersError } = await remindersQuery.order("created_at", { ascending: false });

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
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

