import { NextRequest, NextResponse } from "next/server";
import { validateAuth, createAuthenticatedClient } from "@/lib/auth/middleware";
import { checkUserExists, validateEmailFormat } from "@/lib/supabase/users";
import type { AccountType } from "@/lib/supabase/auth";

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden";
  created_at: string;
  updated_at: string;
}

// Reminder assignment format
interface ReminderAssignment {
  id: string;
  reminder_id: string;
  assignedto: string;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden";
  created_at: string;
}

// Profile result format (for team expansion)
interface ProfileEmail {
  email: string;
}

/**
 * Expand team assignments to individual user emails
 * Takes array like ["team:CRM", "user@example.com", "team:AI"]
 * Returns expanded array of individual emails
 */
async function expandTeamAssignments(
  assignedTo: string[],
  supabaseClient: ReturnType<typeof createAuthenticatedClient>
): Promise<string[]> {
  const expandedEmails: string[] = [];
  const teamTypes: AccountType[] = [];

  // Separate team assignments from individual emails
  for (const assignment of assignedTo) {
    if (assignment.startsWith("team:")) {
      const teamName = assignment.replace("team:", "") as AccountType;
      teamTypes.push(teamName);
    } else {
      expandedEmails.push(assignment.trim().toLowerCase());
    }
  }

  // If there are team assignments, fetch users for those teams
  if (teamTypes.length > 0) {
    const { data: profiles, error } = await supabaseClient
      .from("profiles")
      .select("email")
      .in("account_type", teamTypes)
      .eq("approved", true);

    if (error) {
      console.error("Error fetching team members:", error);
    } else if (profiles) {
      // Add team member emails
      const typedProfiles = profiles as ProfileEmail[];
      for (const profile of typedProfiles) {
        if (profile.email) {
          expandedEmails.push(profile.email.trim().toLowerCase());
        }
      }
    }
  }

  // Remove duplicates and return
  return Array.from(new Set(expandedEmails));
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
    assignedTo: assignments.map((a) => a.assignedto),
    createdAt: new Date(dbReminder.created_at), // Include created_at for sorting
  };
}

export async function POST(request: NextRequest) {
  try {
    // Validate JWT token and get authenticated user
    const authResult = await validateAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const { user } = authResult;
    const body = await request.json();
    const { title, description, dueDate, assignedTo } = body;

    // Validate request body
    if (!title) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    // Create authenticated Supabase client
    const supabase = createAuthenticatedClient(request.headers.get("authorization")!.substring(7));

    // Default to assigning to creator if no assignedTo provided
    const rawAssignedTo = assignedTo && assignedTo.length > 0 ? assignedTo : [user.email];

    // Validate all assignees exist before creating the reminder
    if (assignedTo && assignedTo.length > 0) {
      const invalidEmails: string[] = [];

      for (const assignment of assignedTo) {
        // Skip team assignments in validation
        if (assignment.startsWith("team:")) {
          continue;
        }

        const normalizedEmail = assignment.trim().toLowerCase();

        // Validate email format
        if (!validateEmailFormat(normalizedEmail)) {
          invalidEmails.push(assignment);
          continue;
        }

        // Check if user exists
        const exists = await checkUserExists(normalizedEmail);
        if (!exists) {
          invalidEmails.push(assignment);
        }
      }

      if (invalidEmails.length > 0) {
        const errorMessage = invalidEmails.length === 1
          ? `User does not exist: The email "${invalidEmails[0]}" is not registered in the system.`
          : `Users do not exist: The following emails are not registered: ${invalidEmails.join(", ")}`;
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    // Expand team assignments to individual emails
    const finalAssignedTo = await expandTeamAssignments(rawAssignedTo, supabase);

    // Create the reminder (RLS will ensure user can only create for themselves)
    const { data: reminderData, error: reminderError } = await supabase
      .from("reminders")
      .insert({
        user_id: user.email, // Use authenticated user's email
        title: title,
        description: description || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status: "backlog",
        last_status_change_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (reminderError) {
      console.error("Error creating reminder:", reminderError);
      return NextResponse.json(
        { error: "Failed to create reminder", details: reminderError.message },
        { status: 500 }
      );
    }

    // Create assignments for all assigned users
    if (finalAssignedTo.length > 0) {
      const assignments = finalAssignedTo.map((email: string) => ({
        reminder_id: reminderData.id,
        assignedto: email.trim().toLowerCase(),
        status: "backlog" as const,
      }));

      const { error: assignmentError } = await supabase
        .from("reminder_assignments")
        .insert(assignments);

      if (assignmentError) {
        console.error("Error creating reminder assignments:", assignmentError);
        return NextResponse.json(
          { error: "Failed to create reminder assignments", details: assignmentError.message },
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

    // Create notifications asynchronously in background (fire and forget)
    if (finalAssignedTo.length > 0) {
      console.log(`[NOTIFICATIONS] Creating notifications for ${finalAssignedTo.length} users`);
      console.log(`[NOTIFICATIONS] Assigned to:`, finalAssignedTo);
      console.log(`[NOTIFICATIONS] Creator (excluded):`, user.email);

      const notificationPromises = finalAssignedTo
        .filter((email) => email !== user.email.toLowerCase())
        .map((email) => {
          console.log(`[NOTIFICATIONS] Creating notification for:`, email);
          return supabase.from("notifications").insert({
            user_email: email,
            type: "reminder_assigned",
            title: "New Reminder Assigned",
            message: `You were assigned to: ${reminderData.title}`,
            reminder_id: reminderData.id,
            read: false,
          });
        });

      // Fire and forget - don't await, let it happen in background
      Promise.all(notificationPromises)
        .then((results) => {
          console.log(`[NOTIFICATIONS] Successfully created ${results.length} notifications`);
          results.forEach((result, index) => {
            if (result.error) {
              console.error(`[NOTIFICATIONS] Error for user ${finalAssignedTo[index]}:`, result.error);
            } else {
              console.log(`[NOTIFICATIONS] ✅ Notification created for ${finalAssignedTo[index]}`);
            }
          });
        })
        .catch((error) => {
          console.error("[NOTIFICATIONS] Error creating notifications:", error);
        });
    }

    // Return response immediately (notifications continue in background)
    return NextResponse.json(reminder, { status: 200 });
  } catch (error) {
    console.error("Error in create reminder API route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
