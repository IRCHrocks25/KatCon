import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUserExistsServer, validateEmailFormat } from "@/lib/supabase/server-users";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "done" | "hidden";
  created_at: string;
  updated_at: string;
}

// Reminder assignment format
interface ReminderAssignment {
  id: string;
  reminder_id: string;
  user_email: string;
  status: "pending" | "done" | "hidden";
  created_at: string;
}

// Convert database reminder to app reminder format
function dbToAppReminder(
  dbReminder: DatabaseReminder,
  assignments: ReminderAssignment[] = []
) {
  return {
    id: dbReminder.id,
    title: dbReminder.title,
    description: dbReminder.description || undefined,
    dueDate: dbReminder.due_date ? new Date(dbReminder.due_date) : undefined,
    status: dbReminder.status,
    createdBy: dbReminder.user_id,
    assignedTo: assignments.map((a) => a.user_email),
    createdAt: new Date(dbReminder.created_at), // Include created_at for sorting
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, dueDate, assignedTo, userEmail } = body;

    // Validate request body
    if (!title || !userEmail) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "title and userEmail are required",
        },
        { status: 400 }
      );
    }

    // Default to assigning to creator if no assignedTo provided
    const finalAssignedTo =
      assignedTo && assignedTo.length > 0 ? assignedTo : [userEmail];

    // Validate all assignees exist before creating the reminder
    if (assignedTo && assignedTo.length > 0) {
      const invalidEmails: string[] = [];

      for (const email of assignedTo) {
        const normalizedEmail = email.trim().toLowerCase();

        // Validate email format
        if (!validateEmailFormat(normalizedEmail)) {
          invalidEmails.push(email);
          continue;
        }

        // Check if user exists using server-side function directly
        const exists = await checkUserExistsServer(normalizedEmail);
        if (!exists) {
          invalidEmails.push(email);
        }
      }

      if (invalidEmails.length > 0) {
        const errorMessage =
          invalidEmails.length === 1
            ? `User does not exist: The email "${invalidEmails[0]}" is not registered in the system.`
            : `Users do not exist: The following emails are not registered: ${invalidEmails.join(", ")}`;
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }
    }

    // Create Supabase client with service role key for server-side operations
    // This bypasses RLS, but we validate userEmail in the request body
    const supabase = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })
      : createClient(supabaseUrl, supabaseAnonKey);

    // Create the reminder
    const { data: reminderData, error: reminderError } = await supabase
      .from("reminders")
      .insert({
        user_id: userEmail,
        title: title,
        description: description || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status: "pending",
      })
      .select()
      .single();

    if (reminderError) {
      console.error("Error creating reminder:", reminderError);
      return NextResponse.json(
        {
          error: "Failed to create reminder",
          details: reminderError.message,
        },
        { status: 500 }
      );
    }

    // Create assignments for all assigned users
    if (finalAssignedTo.length > 0) {
      const assignments = finalAssignedTo.map((email: string) => ({
        reminder_id: reminderData.id,
        user_email: email.trim().toLowerCase(),
        status: "pending" as const,
      }));

      const { error: assignmentError } = await supabase
        .from("reminder_assignments")
        .insert(assignments);

      if (assignmentError) {
        console.error("Error creating reminder assignments:", assignmentError);
        return NextResponse.json(
          {
            error: "Failed to create reminder assignments",
            details: assignmentError.message,
          },
          { status: 500 }
        );
      }
    }

    // Fetch the assignments to ensure we have the latest data
    const { data: assignmentsData, error: fetchError } = await supabase
      .from("reminder_assignments")
      .select("*")
      .eq("reminder_id", reminderData.id);

    if (fetchError) {
      console.error("Error fetching assignments after creation:", fetchError);
    }

    // Convert to app format
    const reminder = dbToAppReminder(reminderData, assignmentsData || []);

    return NextResponse.json(reminder, { status: 200 });
  } catch (error) {
    console.error("Error in create reminder API route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

