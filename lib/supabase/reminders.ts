import { supabase } from "./client";

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "pending" | "done" | "hidden";
}

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string; // Now stores email instead of UUID
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "done" | "hidden";
  created_at: string;
  updated_at: string;
}

// Convert database reminder to app reminder format
function dbToAppReminder(dbReminder: DatabaseReminder): Reminder {
  return {
    id: dbReminder.id,
    title: dbReminder.title,
    description: dbReminder.description || undefined,
    dueDate: dbReminder.due_date ? new Date(dbReminder.due_date) : undefined,
    status: dbReminder.status,
  };
}

// Get all pending reminders for the current user
export async function getReminders(): Promise<Reminder[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    // Return empty array if user is not authenticated (don't throw error)
    return [];
  }

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", user.email)
    .neq("status", "hidden")
    .order("created_at", { ascending: false })
    .limit(100); // Add limit to prevent large queries

  if (error) {
    console.error("Error fetching reminders:", error);
    // Return empty array instead of throwing to prevent blocking UI
    return [];
  }

  return (data || []).map(dbToAppReminder);
}

// Create a new reminder
export async function createReminder(
  reminder: Omit<Reminder, "id" | "status">
): Promise<Reminder> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.email,
      title: reminder.title,
      description: reminder.description || null,
      due_date: reminder.dueDate ? reminder.dueDate.toISOString() : null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return dbToAppReminder(data);
}

// Update reminder (title, description, dueDate)
export async function updateReminder(
  id: string,
  reminder: Omit<Reminder, "id" | "status">
): Promise<Reminder> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("reminders")
    .update({
      title: reminder.title,
      description: reminder.description || null,
      due_date: reminder.dueDate ? reminder.dueDate.toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.email)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return dbToAppReminder(data);
}

// Update reminder status (via API route)
export async function updateReminderStatus(
  id: string,
  status: "pending" | "done" | "hidden"
): Promise<Reminder | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  // Get the access token from the session
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  // Call the API route instead of direct Supabase call
  // Include credentials to send cookies for authentication
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add authorization header if we have a session
  if (currentSession?.access_token) {
    headers["Authorization"] = `Bearer ${currentSession.access_token}`;
  }

  const response = await fetch("/api/reminders/update-status", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ id, status }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.details || error.error || "Failed to update reminder status"
    );
  }

  // If status is 'done' or 'hidden', we don't need to return the reminder
  if (status === "done" || status === "hidden") {
    return null;
  }

  // For 'pending', fetch the updated reminder
  if (!user.email) {
    return null;
  }

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.email)
    .single();

  if (error || !data) {
    return null;
  }

  return dbToAppReminder(data);
}

// Delete a reminder (soft delete - sets status to 'hidden')
// Uses API route to handle server-side updates
export async function deleteReminder(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  // Get the access token from the session
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  // Call the API route instead of direct Supabase call
  // Include credentials to send cookies for authentication
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add authorization header if we have a session
  if (currentSession?.access_token) {
    headers["Authorization"] = `Bearer ${currentSession.access_token}`;
  }

  const response = await fetch("/api/reminders/delete", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ id }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.details || error.error || "Failed to delete reminder"
    );
  }
}
