import { supabase } from "./client";
import { getUserEmail } from "./session";
import { checkUserExists, validateEmailFormat } from "./users";

const isDev = process.env.NODE_ENV === "development";

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "pending" | "done" | "hidden";
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

// Convert database reminder to app reminder format
async function dbToAppReminder(
  dbReminder: DatabaseReminder,
  assignments: ReminderAssignment[] = []
): Promise<Reminder> {
  return {
    id: dbReminder.id,
    title: dbReminder.title,
    description: dbReminder.description || undefined,
    dueDate: dbReminder.due_date ? new Date(dbReminder.due_date) : undefined,
    status: dbReminder.status,
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

  const assignedReminderIds = assignedReminders?.map((a) => a.reminder_id) || [];

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
  const allReminders = [
    ...(createdReminders || []),
    ...assignedRemindersData,
  ];
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
        assignmentsByReminder.get(reminder.id) || []
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
  const assignedTo = reminder.assignedTo && reminder.assignedTo.length > 0
    ? reminder.assignedTo
    : [userEmail];

  // Validate all assignees exist before creating the reminder
  if (reminder.assignedTo && reminder.assignedTo.length > 0) {
    const invalidEmails: string[] = [];
    
    for (const email of reminder.assignedTo) {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Validate email format
      if (!validateEmailFormat(normalizedEmail)) {
        invalidEmails.push(email);
        continue;
      }
      
      // Check if user exists
      const exists = await checkUserExists(normalizedEmail);
      if (!exists) {
        invalidEmails.push(email);
      }
    }
    
    if (invalidEmails.length > 0) {
      const errorMessage = invalidEmails.length === 1
        ? `User does not exist: The email "${invalidEmails[0]}" is not registered in the system.`
        : `Users do not exist: The following emails are not registered: ${invalidEmails.join(", ")}`;
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

  // Create assignments for all assigned users
  if (assignedTo.length > 0) {
    const assignments = assignedTo.map((email) => ({
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
      throw new Error(`Failed to create reminder assignments: ${assignmentError.message || JSON.stringify(assignmentError)}`);
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
    if (isDev) console.error("Error fetching assignments after creation:", fetchError);
  }

  if (isDev) {
    console.log("Reminder created with assignments:", {
      reminderId: reminderData.id,
      assignments: assignmentsData || [],
    });
  }

  return dbToAppReminder(reminderData, assignmentsData || []);
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
    // Delete existing assignments
    const { error: deleteError } = await supabase
      .from("reminder_assignments")
      .delete()
      .eq("reminder_id", id);

    if (deleteError) {
      if (isDev) console.error("Error deleting assignments:", deleteError);
    }

    // Create new assignments
    if (reminder.assignedTo.length > 0) {
      const assignments = reminder.assignedTo.map((email) => ({
        reminder_id: id,
        user_email: email.trim().toLowerCase(),
        status: "pending" as const,
      }));

      const { error: insertError, data: insertedAssignments } = await supabase
        .from("reminder_assignments")
        .insert(assignments)
        .select();

      if (insertError) {
        if (isDev) console.error("Error inserting assignments:", insertError);
        throw new Error(`Failed to update assignments: ${insertError.message}`);
      }

      if (isDev && insertedAssignments) {
        console.log("Updated assignments:", insertedAssignments);
      }
    }
  }

  // Always fetch updated assignments to ensure we have the latest data
  const { data: assignmentsData, error: fetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  if (fetchError) {
    if (isDev) console.error("Error fetching assignments after update:", fetchError);
  }

  return dbToAppReminder(reminderData, assignmentsData || []);
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

  // Check if user is creator or assigned to this reminder
  const { data: reminder, error: reminderError } = await supabase
    .from("reminders")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (reminderError || !reminder) {
    throw new Error("Reminder not found");
  }

  const isCreator = reminder.user_id === userEmail;

  // Check if user is assigned to this reminder
  const { data: assignment } = await supabase
    .from("reminder_assignments")
    .select("id, status")
    .eq("reminder_id", id)
    .eq("user_email", userEmail)
    .single();

  const isAssigned = !!assignment;

  if (!isCreator && !isAssigned) {
    throw new Error("You are not authorized to update this reminder");
  }

  // If user is assigned (not creator), update their assignment status
  if (isAssigned && !isCreator) {
    const { error: assignmentUpdateError } = await supabase
      .from("reminder_assignments")
      .update({ status })
      .eq("id", assignment.id);

    if (assignmentUpdateError) {
      throw new Error(
        `Failed to update assignment status: ${assignmentUpdateError.message}`
      );
    }
  } else if (isCreator) {
    // If user is creator, update the reminder status directly
    const { error: reminderUpdateError } = await supabase
      .from("reminders")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userEmail);

    if (reminderUpdateError) {
      throw new Error(
        `Failed to update reminder status: ${reminderUpdateError.message}`
      );
    }
  }

  // If status is 'done' or 'hidden', we don't need to return the reminder
  if (status === "done" || status === "hidden") {
    return null;
  }

  // For 'pending', fetch the updated reminder with assignments
  const { data: reminderData, error: fetchError } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !reminderData) {
    return null;
  }

  // Fetch assignments for this reminder
  const { data: assignmentsData } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  return dbToAppReminder(reminderData, assignmentsData || []);
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
