import { supabase } from "./client";

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "pending" | "done";
}

// Database reminder format (matches Supabase schema)
interface DatabaseReminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "done";
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
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "done")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(dbToAppReminder);
}

// Create a new reminder
export async function createReminder(reminder: Omit<Reminder, "id" | "status">): Promise<Reminder> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
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

// Update reminder status
export async function updateReminderStatus(
  id: string,
  status: "pending" | "done"
): Promise<Reminder> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("reminders")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return dbToAppReminder(data);
}

// Delete a reminder
export async function deleteReminder(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }
}

