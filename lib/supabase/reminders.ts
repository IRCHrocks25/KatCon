import { supabase } from "./client";
import { getUserEmail } from "./session";
import { checkUserExists, validateEmailFormat } from "./users";
import type { AccountType } from "./auth";

const isDev = process.env.NODE_ENV === "development";

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "pending" | "done" | "hidden"; // Overall reminder status (creator's view)
  myStatus?: "pending" | "done" | "hidden"; // Current user's assignment status
  createdBy: string; // Email of the creator
  assignedTo: string[]; // Array of emails of assigned users
}

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string; // Now stores email instead of UUID (creator)
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

/**
 * Expand team assignments to individual user emails
 * Takes array like ["team:CRM", "user@example.com", "team:AI"]
 * Returns expanded array of individual emails
 */
async function expandTeamAssignments(assignedTo: string[]): Promise<string[]> {
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
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("email")
      .in("account_type", teamTypes)
      .eq("approved", true);

    if (error) {
      if (isDev) console.error("Error fetching team members:", error);
    } else if (profiles) {
      // Add team member emails
      for (const profile of profiles) {
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
async function dbToAppReminder(
  dbReminder: DatabaseReminder,
  assignments: ReminderAssignment[] = [],
  currentUserEmail?: string
): Promise<Reminder> {
  // Find current user's assignment status (if they're assigned)
  // Normalize emails to lowercase for comparison
  const normalizedUserEmail = currentUserEmail?.toLowerCase();
  const myAssignment = normalizedUserEmail
    ? assignments.find(
        (a) => a.user_email?.toLowerCase() === normalizedUserEmail
      )
    : null;

  console.log("[REMINDER] dbToAppReminder converting:", {
    reminderId: dbReminder.id,
    currentUserEmail,
    assignmentsCount: assignments.length,
    myAssignment: myAssignment
      ? {
          id: myAssignment.id,
          status: myAssignment.status,
          user_email: myAssignment.user_email,
        }
      : null,
    allAssignments: assignments.map((a) => ({
      user_email: a.user_email,
      status: a.status,
    })),
  });

  return {
    id: dbReminder.id,
    title: dbReminder.title,
    description: dbReminder.description || undefined,
    dueDate: dbReminder.due_date ? new Date(dbReminder.due_date) : undefined,
    status: dbReminder.status, // Overall reminder status
    myStatus: myAssignment?.status, // Current user's assignment status
    createdBy: dbReminder.user_id,
    assignedTo: assignments.map((a) => a.user_email),
  };
}

// Get all pending reminders for the current user
// Returns reminders where user is assigned OR created by user
export async function getReminders(): Promise<Reminder[]> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    return [];
  }

  // Get reminder IDs where user is assigned
  const { data: assignedReminders } = await supabase
    .from("reminder_assignments")
    .select("reminder_id")
    .eq("user_email", userEmail)
    .neq("status", "hidden");

  const assignedReminderIds =
    assignedReminders?.map((a) => a.reminder_id) || [];

  // Get reminders where user is creator
  const { data: createdReminders, error: createdError } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userEmail)
    .neq("status", "hidden");

  // Get reminders where user is assigned
  let assignedRemindersData: DatabaseReminder[] = [];
  if (assignedReminderIds.length > 0) {
    const { data: assignedData, error: assignedError } = await supabase
      .from("reminders")
      .select("*")
      .in("id", assignedReminderIds)
      .neq("status", "hidden");

    if (!assignedError && assignedData) {
      assignedRemindersData = assignedData;
    }
  }

  // Combine and deduplicate reminders
  const allReminders = [...(createdReminders || []), ...assignedRemindersData];
  const uniqueReminders = Array.from(
    new Map(allReminders.map((r) => [r.id, r])).values()
  );

  if (createdError) {
    if (isDev) console.error("Error fetching reminders:", createdError);
    return [];
  }

  if (uniqueReminders.length === 0) {
    return [];
  }

  // Sort by created_at descending
  const sortedReminders = uniqueReminders.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Fetch all assignments for these reminders
  const reminderIds = sortedReminders.map((r) => r.id);
  const { data: allAssignments, error: assignmentsError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .in("reminder_id", reminderIds);

  if (assignmentsError) {
    if (isDev) console.error("Error fetching assignments:", assignmentsError);
  }

  // Group assignments by reminder_id
  const assignmentsByReminder = new Map<string, ReminderAssignment[]>();
  (allAssignments || []).forEach((assignment) => {
    const existing = assignmentsByReminder.get(assignment.reminder_id) || [];
    existing.push(assignment);
    assignmentsByReminder.set(assignment.reminder_id, existing);
  });

  // Convert to app format
  return Promise.all(
    sortedReminders.map((reminder) =>
      dbToAppReminder(
        reminder,
        assignmentsByReminder.get(reminder.id) || [],
        userEmail // Pass current user email
      )
    )
  );
}

// Create a new reminder
export async function createReminder(
  reminder: Omit<Reminder, "id" | "status" | "createdBy" | "assignedTo"> & {
    assignedTo?: string[];
  }
): Promise<Reminder> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  // Default to assigning to creator if no assignedTo provided
  const assignedTo =
    reminder.assignedTo && reminder.assignedTo.length > 0
      ? reminder.assignedTo
      : [userEmail];

  // Expand team assignments to individual emails
  const expandedEmails = await expandTeamAssignments(assignedTo);

  // Validate all assignees exist before creating the reminder
  // Only validate non-team assignments (individual emails)
  if (reminder.assignedTo && reminder.assignedTo.length > 0) {
    const invalidEmails: string[] = [];

    for (const assignment of reminder.assignedTo) {
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
      const errorMessage =
        invalidEmails.length === 1
          ? `User does not exist: The email "${invalidEmails[0]}" is not registered in the system.`
          : `Users do not exist: The following emails are not registered: ${invalidEmails.join(
              ", "
            )}`;
      throw new Error(errorMessage);
    }
  }

  // Create the reminder
  const { data: reminderData, error: reminderError } = await supabase
    .from("reminders")
    .insert({
      user_id: userEmail,
      title: reminder.title,
      description: reminder.description || null,
      due_date: reminder.dueDate ? reminder.dueDate.toISOString() : null,
      status: "pending",
    })
    .select()
    .single();

  if (reminderError) {
    throw reminderError;
  }

  // Create assignments for all assigned users (using expanded emails)
  if (expandedEmails.length > 0) {
    const assignments = expandedEmails.map((email) => ({
      reminder_id: reminderData.id,
      user_email: email.trim().toLowerCase(),
      status: "pending" as const,
    }));

    const { error: assignmentError, data: insertedAssignments } = await supabase
      .from("reminder_assignments")
      .insert(assignments)
      .select();

    if (assignmentError) {
      if (isDev) {
        console.error("Error creating reminder assignments:", {
          error: assignmentError,
          message: assignmentError.message,
          details: assignmentError.details,
          hint: assignmentError.hint,
          code: assignmentError.code,
          assignments: assignments,
        });
      }
      throw new Error(
        `Failed to create reminder assignments: ${
          assignmentError.message || JSON.stringify(assignmentError)
        }`
      );
    }

    if (isDev && insertedAssignments) {
      console.log("Created assignments:", insertedAssignments);
    }
  }

  // Always fetch the assignments to ensure we have the latest data
  const { data: assignmentsData, error: fetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", reminderData.id);

  if (fetchError) {
    if (isDev)
      console.error("Error fetching assignments after creation:", fetchError);
  }

  if (isDev) {
    console.log("Reminder created with assignments:", {
      reminderId: reminderData.id,
      assignments: assignmentsData || [],
    });
  }

  return dbToAppReminder(reminderData, assignmentsData || [], userEmail);
}

// Update reminder (title, description, dueDate)
// Only creator can update reminder details
export async function updateReminder(
  id: string,
  reminder: Omit<Reminder, "id" | "status" | "createdBy" | "assignedTo"> & {
    assignedTo?: string[];
  }
): Promise<Reminder> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  // Update the reminder (only creator can do this)
  const { data: reminderData, error: reminderError } = await supabase
    .from("reminders")
    .update({
      title: reminder.title,
      description: reminder.description || null,
      due_date: reminder.dueDate ? reminder.dueDate.toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", userEmail) // Only creator can update
    .select()
    .single();

  if (reminderError) {
    throw reminderError;
  }

  // If assignedTo is provided, update assignments
  if (reminder.assignedTo !== undefined) {
    // Expand team assignments to individual emails
    const expandedEmails = await expandTeamAssignments(reminder.assignedTo);
    const normalizedNewEmails = expandedEmails.map(email => email.trim().toLowerCase());

    // Fetch existing assignments to preserve statuses
    const { data: existingAssignments, error: fetchExistingError } = await supabase
      .from("reminder_assignments")
      .select("*")
      .eq("reminder_id", id);

    if (fetchExistingError) {
      if (isDev) console.error("Error fetching existing assignments:", fetchExistingError);
      throw new Error(`Failed to fetch existing assignments: ${fetchExistingError.message}`);
    }

    const existingEmails = (existingAssignments || []).map(a => a.user_email?.toLowerCase() || '');
    const existingStatuses = new Map(
      (existingAssignments || []).map(a => [a.user_email?.toLowerCase() || '', a.status])
    );

    // Determine which assignments to add, keep, and remove
    const emailsToAdd = normalizedNewEmails.filter(email => !existingEmails.includes(email));
    const emailsToKeep = normalizedNewEmails.filter(email => existingEmails.includes(email));
    const emailsToRemove = existingEmails.filter(email => !normalizedNewEmails.includes(email));

    // Remove assignments that are no longer in the list
    if (emailsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("reminder_assignments")
        .delete()
        .eq("reminder_id", id)
        .in("user_email", emailsToRemove);

      if (deleteError) {
        if (isDev) console.error("Error deleting assignments:", deleteError);
        throw new Error(`Failed to remove assignments: ${deleteError.message}`);
      }
    }

    // Add new assignments (with pending status)
    if (emailsToAdd.length > 0) {
      const newAssignments = emailsToAdd.map((email) => ({
        reminder_id: id,
        user_email: email,
        status: "pending" as const,
      }));

      const { error: insertError, data: insertedAssignments } = await supabase
        .from("reminder_assignments")
        .insert(newAssignments)
        .select();

      if (insertError) {
        if (isDev) console.error("Error inserting assignments:", insertError);
        throw new Error(`Failed to add assignments: ${insertError.message}`);
      }

      if (isDev && insertedAssignments) {
        console.log("Added new assignments:", insertedAssignments);
      }
    }

    // Existing assignments that remain in the list are preserved with their current statuses
    // No update needed - they stay as-is, preserving "done" status if it was set
    if (isDev && emailsToKeep.length > 0) {
      console.log("Preserved existing assignments:", emailsToKeep.map(email => ({
        email,
        status: existingStatuses.get(email)
      })));
    }
  }

  // Always fetch updated assignments to ensure we have the latest data
  const { data: assignmentsData, error: fetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  if (fetchError) {
    if (isDev)
      console.error("Error fetching assignments after update:", fetchError);
  }

  return dbToAppReminder(reminderData, assignmentsData || [], userEmail);
}

// Update reminder status (client-side)
// Updates the per-user status in the junction table for assigned users
// For creators, updates the reminder status directly
export async function updateReminderStatus(
  id: string,
  status: "pending" | "done" | "hidden"
): Promise<Reminder | null> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  console.log(`[REMINDER] updateReminderStatus called:`, {
    id,
    status,
    userEmail,
  });

  // Check if user is creator or assigned to this reminder
  const { data: reminder, error: reminderError } = await supabase
    .from("reminders")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (reminderError || !reminder) {
    console.error("[REMINDER] Reminder not found:", reminderError);
    throw new Error("Reminder not found");
  }

  const isCreator = reminder.user_id === userEmail;
  console.log(`[REMINDER] User role check:`, {
    isCreator,
    creatorEmail: reminder.user_id,
  });

  // Check if user is assigned to this reminder
  const { data: assignment } = await supabase
    .from("reminder_assignments")
    .select("id, status")
    .eq("reminder_id", id)
    .eq("user_email", userEmail)
    .single();

  const isAssigned = !!assignment;
  console.log(`[REMINDER] Assignment check:`, {
    isAssigned,
    currentStatus: assignment?.status,
  });

  if (!isCreator && !isAssigned) {
    console.error("[REMINDER] Unauthorized update attempt");
    throw new Error("You are not authorized to update this reminder");
  }

  // If user is assigned (not creator), update their assignment status AND overall reminder status
  if (isAssigned && !isCreator) {
    console.log(
      `[REMINDER] Assignee updating status: ${userEmail} -> ${status}`
    );
    console.log(
      `[REMINDER] Assignment ID: ${assignment.id}, Reminder ID: ${id}`
    );

    // Step 1: Update the assignee's individual status
    const { data: assignmentData, error: assignmentUpdateError } =
      await supabase
        .from("reminder_assignments")
        .update({ status })
        .eq("id", assignment.id)
        .select() // Return data to avoid 406 error
        .single();

    if (assignmentUpdateError) {
      console.error(
        "[REMINDER] Assignment update error:",
        assignmentUpdateError
      );
      throw new Error(
        `Failed to update assignment status: ${assignmentUpdateError.message}`
      );
    }
    console.log("[REMINDER] ✅ Assignment status updated:", assignmentData);

    // Step 2: Update the overall reminder status (so creator sees the change too)
    console.log("[REMINDER] Updating overall reminder status...");
    const { data: reminderUpdateData, error: reminderUpdateError } =
      await supabase
        .from("reminders")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

    if (reminderUpdateError) {
      console.error(
        "[REMINDER] ❌ Failed to update overall reminder status:",
        reminderUpdateError
      );
      console.error("[REMINDER] Reminder update error details:", {
        message: reminderUpdateError.message,
        code: reminderUpdateError.code,
        details: reminderUpdateError.details,
        hint: reminderUpdateError.hint,
      });
      // Don't throw - allow the assignment update to succeed even if reminder update fails
    } else {
      console.log(
        "[REMINDER] ✅ Overall reminder status updated:",
        reminderUpdateData
      );
    }
  } else if (isCreator) {
    // If user is creator, update the reminder status AND all assignees' statuses
    console.log(
      `[REMINDER] Creator updating status: ${userEmail} -> ${status}`
    );

    // Step 1: Update the overall reminder status
    const { data: reminderData, error: reminderUpdateError } = await supabase
      .from("reminders")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userEmail)
      .select() // Return data to avoid 406 error
      .single();

    if (reminderUpdateError) {
      console.error("[REMINDER] Creator update error:", reminderUpdateError);
      throw new Error(
        `Failed to update reminder status: ${reminderUpdateError.message}`
      );
    }
    console.log(
      "[REMINDER] ✅ Reminder status updated by creator:",
      reminderData
    );

    // Step 2: Update all assignees' individual statuses to match
    console.log(
      "[REMINDER] Updating all assignees' statuses to match reminder status..."
    );
    const { data: allAssignments, error: assignmentsFetchError } =
      await supabase
        .from("reminder_assignments")
        .select("id")
        .eq("reminder_id", id);

    if (assignmentsFetchError) {
      console.error(
        "[REMINDER] Failed to fetch assignments:",
        assignmentsFetchError
      );
      // Don't throw - reminder update succeeded, assignment update is secondary
    } else if (allAssignments && allAssignments.length > 0) {
      console.log(
        `[REMINDER] Found ${allAssignments.length} assignments to update`
      );

      const { error: assignmentsUpdateError } = await supabase
        .from("reminder_assignments")
        .update({ status })
        .eq("reminder_id", id);

      if (assignmentsUpdateError) {
        console.error(
          "[REMINDER] ❌ Failed to update assignees' statuses:",
          assignmentsUpdateError
        );
        console.error("[REMINDER] Assignments update error details:", {
          message: assignmentsUpdateError.message,
          code: assignmentsUpdateError.code,
          details: assignmentsUpdateError.details,
          hint: assignmentsUpdateError.hint,
        });
        // Don't throw - reminder update succeeded, assignment update is secondary
      } else {
        console.log(
          `[REMINDER] ✅ Updated ${allAssignments.length} assignees' statuses to ${status}`
        );
      }
    } else {
      console.log("[REMINDER] No assignments found to update");
    }
  }

  // Always fetch and return the updated reminder with assignments
  console.log("[REMINDER] Fetching updated reminder data...");
  const { data: reminderData, error: fetchError } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !reminderData) {
    console.error("[REMINDER] Failed to fetch updated reminder:", fetchError);
    return null;
  }

  // Fetch assignments for this reminder
  const { data: assignmentsData, error: assignmentsFetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  if (assignmentsFetchError) {
    console.error(
      "[REMINDER] Failed to fetch assignments:",
      assignmentsFetchError
    );
  }

  console.log(
    "[REMINDER] Fetched assignments:",
    assignmentsData?.map((a) => ({
      id: a.id,
      user_email: a.user_email,
      status: a.status,
      isCurrentUser: a.user_email === userEmail,
    }))
  );

  const updatedReminder = await dbToAppReminder(
    reminderData,
    assignmentsData || [],
    userEmail
  );
  console.log("[REMINDER] ✅ Returning updated reminder:", {
    id: updatedReminder.id,
    status: updatedReminder.status,
    myStatus: updatedReminder.myStatus,
    assignedTo: updatedReminder.assignedTo,
    currentUserEmail: userEmail,
  });

  return updatedReminder;
}

// Delete a reminder (soft delete - sets status to 'hidden')
// Client-side implementation - only creators can delete
export async function deleteReminder(id: string): Promise<void> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  // Check if user is the creator (only creators can delete)
  const { data: reminder, error: reminderError } = await supabase
    .from("reminders")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (reminderError || !reminder) {
    throw new Error("Reminder not found");
  }

  if (reminder.user_id !== userEmail) {
    throw new Error("Only the creator can delete this reminder");
  }

  // Delete the reminder (cascade will delete assignments via foreign key)
  const { error: deleteError } = await supabase
    .from("reminders")
    .update({ status: "hidden" })
    .eq("id", id)
    .eq("user_id", userEmail);

  if (deleteError) {
    throw new Error(`Failed to delete reminder: ${deleteError.message}`);
  }
}
