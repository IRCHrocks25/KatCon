import { supabase } from "./client";
import { getUserEmail } from "./session";
import type { AccountType } from "./auth";
/**
 * Helper function to get authenticated headers for API calls
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  // First try to get current session
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session or it's expired, try to refresh it
  if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now())) {
    if (isDev) console.log("[AUTH] Session expired or missing, attempting refresh");

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      if (isDev) console.error("[AUTH] Session refresh failed:", refreshError);
      throw new Error("Session expired. Please log in again.");
    }

    if (refreshData.session) {
      session = refreshData.session;
      if (isDev) console.log("[AUTH] Session refreshed successfully");
    } else {
      throw new Error("Session expired. Please log in again.");
    }
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  } else {
    throw new Error("No valid authentication token available");
  }

  return headers;
}

const isDev = process.env.NODE_ENV === "development";

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden"; // Overall reminder status (creator's view)
  myStatus?: "backlog" | "in_progress" | "review" | "done" | "hidden"; // Current user's assignment status
  position?: number; // Position for Kanban ordering within columns
  lastStatusChangeAt?: Date; // When the status was last changed
  snoozedUntil?: Date; // When the task is snoozed until
  priority: "low" | "medium" | "high" | "urgent"; // Task priority level
  createdBy: string; // Email of the creator
  assignedTo: string[]; // Array of emails of assigned users
  channelId?: string; // ID of the channel this task belongs to (null for global tasks)
}

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string; // Now stores email instead of UUID (creator)
  title: string;
  description: string | null;
  due_date: string | null;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden";
  position: number;
  last_status_change_at: string;
  snoozed_until: string | null;
  priority: "low" | "medium" | "high" | "urgent"; // Task priority level
  channel_id: string | null;
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
        (a) => a.assignedto?.toLowerCase() === normalizedUserEmail
      )
    : null;

  // Debug logging for reminder conversion (only in development)
  if (isDev && assignments.length > 0) {
    console.log(`[REMINDER] Converting reminder ${dbReminder.id}: ${assignments.length} assignments`);
  }

  return {
    id: dbReminder.id,
    title: dbReminder.title,
    description: dbReminder.description || undefined,
    dueDate: dbReminder.due_date ? new Date(dbReminder.due_date) : undefined,
    status: dbReminder.status, // Overall reminder status
    myStatus: myAssignment?.status, // Current user's assignment status
    position: dbReminder.position, // Position for Kanban ordering
    lastStatusChangeAt: new Date(dbReminder.last_status_change_at),
    snoozedUntil: dbReminder.snoozed_until ? new Date(dbReminder.snoozed_until) : undefined,
    priority: dbReminder.priority || "medium", // Priority level
    createdBy: dbReminder.user_id,
    assignedTo: assignments.map((a) => a.assignedto),
    channelId: dbReminder.channel_id || undefined,
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
    .eq("assignedto", userEmail)
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
    channelId?: string;
  }
): Promise<Reminder> {
  const headers = await getAuthHeaders();

  const response = await fetch("/api/reminders/create", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: reminder.title,
      description: reminder.description,
      dueDate: reminder.dueDate,
      priority: reminder.priority,
      assignedTo: reminder.assignedTo,
      channelId: reminder.channelId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || "Failed to create reminder");
  }

  return response.json();
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

    const existingEmails = (existingAssignments || []).map(a => a.assignedto?.toLowerCase() || '');
    const existingStatuses = new Map(
      (existingAssignments || []).map(a => [a.assignedto?.toLowerCase() || '', a.status])
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
        .in("assignedto", emailsToRemove);

      if (deleteError) {
        if (isDev) console.error("Error deleting assignments:", deleteError);
        throw new Error(`Failed to remove assignments: ${deleteError.message}`);
      }
    }

    // Add new assignments (with backlog status)
    if (emailsToAdd.length > 0) {
      const newAssignments = emailsToAdd.map((email) => ({
        reminder_id: id,
        assignedto: email,
        status: "backlog" as const,
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
  status: "backlog" | "in_progress" | "review" | "done" | "hidden"
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
    .eq("assignedto", userEmail)
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

    // Step 1: Update the overall reminder status and last status change timestamp
    const { data: reminderData, error: reminderUpdateError } = await supabase
      .from("reminders")
      .update({
        status,
        last_status_change_at: new Date().toISOString()
      })
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
      assignedto: a.assignedto,
      status: a.status,
      isCurrentUser: a.assignedto === userEmail,
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

// Update reminder Kanban status and position for drag and drop
// Only users assigned to the task can move it
export async function updateReminderKanban(
  id: string,
  status: "backlog" | "in_progress" | "review" | "done",
  position: number
): Promise<Reminder | null> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  console.log(`[KANBAN] updateReminderKanban called:`, {
    id,
    status,
    position,
    userEmail,
  });

  // Check if user is assigned to this reminder
  const { data: assignment, error: assignmentError } = await supabase
    .from("reminder_assignments")
    .select("id, assignedto")
    .eq("reminder_id", id)
    .eq("assignedto", userEmail.toLowerCase())
    .single();

  console.log(`[KANBAN] Assignment check result:`, {
    assignment,
    assignmentError,
    userEmail: userEmail.toLowerCase(),
  });

  const isAssigned = !!assignment;
  if (!isAssigned) {
    console.error(`[KANBAN] User not assigned to task:`, {
      taskId: id,
      userEmail: userEmail.toLowerCase(),
      assignmentError,
    });
    throw new Error("You are not authorized to move this task");
  }

  // Update the reminder status and position
  const { data: reminderData, error: reminderError } = await supabase
    .from("reminders")
    .update({
      status,
      position,
      last_status_change_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (reminderError) {
    throw new Error(`Failed to update task: ${reminderError.message}`);
  }

  // Update all assignees' statuses to match the new status
  const { error: assignmentsUpdateError } = await supabase
    .from("reminder_assignments")
    .update({ status })
    .eq("reminder_id", id);

  if (assignmentsUpdateError) {
    console.error("Failed to update assignment statuses:", assignmentsUpdateError);
    // Don't throw - reminder update succeeded, assignment update is secondary
  }

  // Fetch assignments for this reminder
  const { data: assignmentsData, error: assignmentsFetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  if (assignmentsFetchError) {
    console.error("Failed to fetch assignments:", assignmentsFetchError);
  }

  return dbToAppReminder(reminderData, assignmentsData || [], userEmail);
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

// ==================== Stale Task Detection ====================

/**
 * Check if a task is stale (not progressed in 3 days and not snoozed)
 */
export function isStaleTask(reminder: Reminder): boolean {
  // Don't mark done or hidden tasks as stale
  if (reminder.status === "done" || reminder.status === "hidden") {
    return false;
  }

  // Don't mark snoozed tasks as stale
  if (reminder.snoozedUntil && reminder.snoozedUntil > new Date()) {
    return false;
  }

  // Check if last status change was more than 3 days ago
  if (!reminder.lastStatusChangeAt) {
    return false; // No timestamp available
  }

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return reminder.lastStatusChangeAt < threeDaysAgo;
}

/**
 * Get all stale tasks for the current user
 */
export async function getStaleTasks(): Promise<Reminder[]> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    return [];
  }

  // Get reminder IDs where user is assigned
  const { data: assignedReminders } = await supabase
    .from("reminder_assignments")
    .select("reminder_id")
    .eq("assignedto", userEmail)
    .neq("status", "hidden")
    .neq("status", "done");

  const assignedReminderIds =
    assignedReminders?.map((a) => a.reminder_id) || [];

  if (assignedReminderIds.length === 0) {
    return [];
  }

  // Calculate 3 days ago
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Get stale tasks
  const { data: staleReminders, error } = await supabase
    .from("reminders")
    .select("*")
    .in("id", assignedReminderIds)
    .neq("status", "done")
    .neq("status", "hidden")
    .or(`snoozed_until.is.null,snoozed_until.lt.${threeDaysAgo.toISOString()}`)
    .lt("last_status_change_at", threeDaysAgo.toISOString());

  if (error) {
    if (isDev) console.error("Error fetching stale tasks:", error);
    return [];
  }

  if (!staleReminders || staleReminders.length === 0) {
    return [];
  }

  // Fetch assignments for these reminders
  const reminderIds = staleReminders.map((r) => r.id);
  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .in("reminder_id", reminderIds);

  if (assignmentsError) {
    if (isDev) console.error("Error fetching assignments for stale tasks:", assignmentsError);
  }

  // Convert to app format
  return Promise.all(
    staleReminders.map((reminder) =>
      dbToAppReminder(reminder, assignmentsData?.filter(a => a.reminder_id === reminder.id) || [], userEmail)
    )
  );
}

// ==================== Snooze Functionality ====================

/**
 * Snooze a task for 3 days (sets snoozedUntil to 3 days from now)
 */
export async function snoozeTask(id: string): Promise<Reminder | null> {
  const userEmail = await getUserEmail();
  if (!userEmail) {
    throw new Error("User not authenticated");
  }

  // Check if user is assigned to this reminder
  const { data: assignment } = await supabase
    .from("reminder_assignments")
    .select("id")
    .eq("reminder_id", id)
    .eq("assignedto", userEmail)
    .single();

  if (!assignment) {
    throw new Error("You are not assigned to this task");
  }

  // Set snoozedUntil to 3 days from now
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + 3);

  const { data: reminderData, error: reminderError } = await supabase
    .from("reminders")
    .update({
      snoozed_until: snoozedUntil.toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (reminderError) {
    throw new Error(`Failed to snooze task: ${reminderError.message}`);
  }

  // Fetch assignments for this reminder
  const { data: assignmentsData, error: assignmentsFetchError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .eq("reminder_id", id);

  if (assignmentsFetchError) {
    if (isDev) console.error("Error fetching assignments after snoozing:", assignmentsFetchError);
  }

  return dbToAppReminder(reminderData, assignmentsData || [], userEmail);
}

// ==================== Stale Task Notifications ====================

/**
 * Send notifications for stale tasks (called by background job)
 * This should be called periodically to check for stale tasks and notify assignees
 */
export async function notifyStaleTasks(): Promise<void> {
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("email")
      .eq("approved", true);

    if (usersError || !users) {
      console.error("Error fetching users for stale task notifications:", usersError);
      return;
    }

    // For each user, check their stale tasks and send notifications
    for (const user of users) {
      try {
        // Temporarily set the current user context for getStaleTasks
        // We need to modify getStaleTasks to accept a userEmail parameter
        const staleTasks = await getStaleTasksForUser(user.email);

        for (const task of staleTasks) {
          // Check if we already notified about this task recently
          // For now, we'll just send the notification (in production, you'd track this)
          await sendStaleTaskNotification(user.email, task);
        }
      } catch (error) {
        console.error(`Error processing stale tasks for user ${user.email}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in notifyStaleTasks:", error);
  }
}

/**
 * Get stale tasks for a specific user (helper for notifications)
 */
async function getStaleTasksForUser(userEmail: string): Promise<Reminder[]> {
  // Get reminder IDs where user is assigned
  const { data: assignedReminders } = await supabase
    .from("reminder_assignments")
    .select("reminder_id")
    .eq("assignedto", userEmail)
    .neq("status", "hidden")
    .neq("status", "done");

  const assignedReminderIds =
    assignedReminders?.map((a) => a.reminder_id) || [];

  if (assignedReminderIds.length === 0) {
    return [];
  }

  // Calculate 3 days ago
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Get stale tasks
  const { data: staleReminders, error } = await supabase
    .from("reminders")
    .select("*")
    .in("id", assignedReminderIds)
    .neq("status", "done")
    .neq("status", "hidden")
    .or(`snoozed_until.is.null,snoozed_until.lt.${threeDaysAgo.toISOString()}`)
    .lt("last_status_change_at", threeDaysAgo.toISOString());

  if (error) {
    if (isDev) console.error("Error fetching stale tasks for user:", error);
    return [];
  }

  if (!staleReminders || staleReminders.length === 0) {
    return [];
  }

  // Fetch assignments for these reminders
  const reminderIds = staleReminders.map((r) => r.id);
  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("reminder_assignments")
    .select("*")
    .in("reminder_id", reminderIds);

  if (assignmentsError) {
    if (isDev) console.error("Error fetching assignments for stale tasks:", assignmentsError);
  }

  // Convert to app format
  return Promise.all(
    staleReminders.map((reminder) =>
      dbToAppReminder(reminder, assignmentsData?.filter(a => a.reminder_id === reminder.id) || [], userEmail)
    )
  );
}

/**
 * Send a notification for a stale task
 */
async function sendStaleTaskNotification(userEmail: string, task: Reminder): Promise<void> {
  // For now, we'll use the existing notification system
  // In a real implementation, you'd create a specific notification type for stale tasks
  try {
    const notificationMessage = `This task hasn't moved in 3 days. Still relevant? "${task.title}"`;

    // You could use the existing notification system here
    // For now, we'll just log it
    console.log(`[STALE TASK] Would send notification to ${userEmail}: ${notificationMessage}`);

    // TODO: Implement actual notification sending using the app's notification system
    // This would involve creating a notification record in the database
  } catch (error) {
    console.error(`Error sending stale task notification to ${userEmail}:`, error);
  }
}
