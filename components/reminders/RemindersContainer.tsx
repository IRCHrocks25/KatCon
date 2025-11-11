"use client";

import { useState, useEffect } from "react";
import type React from "react";
import { motion } from "motion/react";
import { Bell, Plus, X, Clock, Calendar, Edit, User, Users } from "lucide-react";
import { toast } from "sonner";
import {
  getReminders,
  createReminder,
  updateReminder,
  updateReminderStatus,
  deleteReminder,
  type Reminder,
} from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { validateEmailFormat, checkUserExists } from "@/lib/supabase/users";

export type { Reminder };

interface RemindersContainerProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

export function RemindersContainer({
  reminders,
  setReminders,
}: RemindersContainerProps) {
  const { user: currentUser } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedTo: [] as string[],
  });
  const [emailInput, setEmailInput] = useState("");

  // Fetch reminders on component mount (non-blocking)
  useEffect(() => {
    const fetchReminders = async () => {
      try {
        setIsLoading(true);

        const fetchedReminders = await getReminders();
        setReminders(fetchedReminders);
      } catch (error) {
        console.error("Error fetching reminders:", error);
        // Don't show error toast on initial load to avoid blocking UI
        // Only show error if it's a critical issue
        if (
          error instanceof Error &&
          error.message !== "User not authenticated"
        ) {
          toast.error("Failed to load reminders", {
            description: error.message,
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Small delay to ensure page renders first
    const timeoutId = setTimeout(() => {
      fetchReminders();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [setReminders]);

  const handleAddEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    // Validate email format
    if (!validateEmailFormat(email)) {
      toast.error("Invalid email format");
      return;
    }

    // Check if user exists
    const userExists = await checkUserExists(email);
    if (!userExists) {
      toast.error("User does not exist", {
        description: `The email "${email}" is not registered in the system.`,
      });
      setEmailInput("");
      return;
    }

    // Check if email is already in the list (case-insensitive)
    if (newReminder.assignedTo.some((e) => e.toLowerCase() === email)) {
      toast.error("User already added");
      setEmailInput("");
      return;
    }

    setNewReminder({
      ...newReminder,
      assignedTo: [...newReminder.assignedTo, email],
    });
    setEmailInput("");
  };

  const handleRemoveEmail = (email: string) => {
    setNewReminder({
      ...newReminder,
      assignedTo: newReminder.assignedTo.filter((e) => e !== email),
    });
  };

  const handleAddReminder = async () => {
    if (!newReminder.title.trim()) {
      toast.error("Reminder title is required");
      return;
    }

    try {
      if (editingId) {
        // Update existing reminder
        const updatedReminder = await updateReminder(editingId, {
          title: newReminder.title,
          description: newReminder.description || undefined,
          dueDate: newReminder.dueDate
            ? new Date(newReminder.dueDate)
            : undefined,
          assignedTo: newReminder.assignedTo.length > 0 ? newReminder.assignedTo : undefined,
        });

        setReminders((prev) =>
          prev.map((r) => (r.id === editingId ? updatedReminder : r))
        );
        toast.success("Reminder updated");
        setEditingId(null);
      } else {
        // Create new reminder
        const reminder = await createReminder({
          title: newReminder.title,
          description: newReminder.description || undefined,
          dueDate: newReminder.dueDate
            ? new Date(newReminder.dueDate)
            : undefined,
          assignedTo: newReminder.assignedTo.length > 0 ? newReminder.assignedTo : undefined,
        });

        setReminders((prev) => [...prev, reminder]);
        toast.success("Reminder added");
      }

      setNewReminder({ title: "", description: "", dueDate: "", assignedTo: [] });
      setEmailInput("");
      setIsAdding(false);
    } catch (error) {
      console.error("Error saving reminder:", error);
      toast.error(
        editingId ? "Failed to update reminder" : "Failed to add reminder",
        {
          description: error instanceof Error ? error.message : "Unknown error",
        }
      );
    }
  };

  const handleEditReminder = (reminder: Reminder) => {
    // Only allow creator to edit
    if (reminder.createdBy !== currentUser?.email) {
      toast.error("Only the creator can edit this reminder");
      return;
    }

    setEditingId(reminder.id);
    setNewReminder({
      title: reminder.title,
      description: reminder.description || "",
      dueDate: reminder.dueDate
        ? new Date(reminder.dueDate).toISOString().slice(0, 16)
        : "",
      assignedTo: reminder.assignedTo || [],
    });
    setIsAdding(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewReminder({ title: "", description: "", dueDate: "", assignedTo: [] });
    setEmailInput("");
    setIsAdding(false);
  };

  const handleToggleComplete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;

    const newStatus = reminder.status === "pending" ? "done" : "pending";

    try {
      const updatedReminder = await updateReminderStatus(id, newStatus);

      // Update the reminder in the list (keep it visible with strikethrough)
      if (updatedReminder) {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
      } else {
        // Fallback: update locally if we can't get the updated reminder
        setReminders((prev) =>
          prev.map((reminder) =>
            reminder.id === id ? { ...reminder, status: newStatus } : reminder
          )
        );
      }
    } catch (error) {
      console.error("Error updating reminder status:", error);
      toast.error("Failed to update reminder", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
      toast.success("Reminder deleted");
    } catch (error) {
      console.error("Error deleting reminder:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unknown error occurred";
      toast.error("Failed to delete reminder", {
        description: errorMessage,
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50">
      {/* Header */}
      <div className="p-4 border-b border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Reminders</h2>
        </div>
        <button
          onClick={() => {
            if (isAdding) {
              handleCancelEdit();
            } else {
              setIsAdding(true);
            }
          }}
          className="p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Add Reminder Form */}
      {isAdding && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="p-4 border-b border-gray-800/50 space-y-3"
        >
          <input
            type="text"
            placeholder="Reminder title"
            value={newReminder.title}
            onChange={(e) =>
              setNewReminder({ ...newReminder, title: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewReminder({ title: "", description: "", dueDate: "" });
              }
            }}
            autoFocus
          />
          <textarea
            placeholder="Description (optional)"
            value={newReminder.description}
            onChange={(e) =>
              setNewReminder({ ...newReminder, description: e.target.value })
            }
            rows={3}
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none"
          />
          <div className="relative">
            <input
              type="datetime-local"
              value={newReminder.dueDate}
              onChange={(e) =>
                setNewReminder({ ...newReminder, dueDate: e.target.value })
              }
              className="w-full px-3 py-2 pr-10 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              style={{
                colorScheme: "dark",
              }}
            />
            <Calendar
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          {/* Assign to users */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400 flex items-center gap-1">
              <Users size={12} />
              Assign to (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter email address"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition"
              >
                Add
              </button>
            </div>
            {newReminder.assignedTo.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newReminder.assignedTo.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs"
                  >
                    <User size={10} />
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="hover:text-purple-100"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddReminder}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
            >
              {editingId ? "Save Changes" : "Add"}
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Reminders List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {isLoading && reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading reminders...</p>
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Bell size={48} className="mb-4 opacity-50" />
            <p className="text-sm">No reminders yet</p>
            <p className="text-xs mt-1">Click + to add one</p>
          </div>
        ) : (
          reminders.map((reminder) => (
            <motion.div
              key={reminder.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg border ${
                reminder.status === "done"
                  ? "bg-gray-800/30 border-gray-700/50 opacity-60"
                  : "bg-gray-800/50 border-gray-700/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => handleToggleComplete(reminder.id)}
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition ${
                    reminder.status === "done"
                      ? "bg-purple-600 border-purple-600"
                      : "border-gray-600 hover:border-purple-500"
                  }`}
                >
                  {reminder.status === "done" && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-sm font-medium ${
                      reminder.status === "done"
                        ? "text-gray-500 line-through"
                        : "text-white"
                    }`}
                  >
                    {reminder.title}
                  </h3>
                  {reminder.description && (
                    <p
                      className={`text-xs mt-1 ${
                        reminder.status === "done"
                          ? "text-gray-600 line-through"
                          : "text-gray-400"
                      }`}
                    >
                      {reminder.description}
                    </p>
                  )}
                  {reminder.dueDate && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>
                        {new Date(reminder.dueDate).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {/* Creator and assigned users info */}
                  <div className="mt-2 space-y-1">
                    {reminder.createdBy && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="text-gray-600">Created by:</span>
                        <span className={reminder.createdBy === currentUser?.email ? "text-purple-400 font-medium" : "text-gray-400"}>
                          {reminder.createdBy === currentUser?.email ? "You" : reminder.createdBy}
                        </span>
                      </div>
                    )}
                    {reminder.assignedTo && reminder.assignedTo.length > 0 && (
                      <div className="flex items-start gap-1 text-xs text-gray-500">
                        <Users size={12} className="mt-0.5 text-purple-400" />
                        <div className="flex-1">
                          <span className="text-gray-600">Assigned to: </span>
                          <div className="inline-flex flex-wrap gap-1.5 mt-0.5">
                            {reminder.assignedTo.map((email) => (
                              <span
                                key={email}
                                className={`px-1.5 py-0.5 rounded ${
                                  email === currentUser?.email 
                                    ? "bg-purple-600/20 text-purple-300 font-medium" 
                                    : "bg-gray-700/50 text-gray-300"
                                }`}
                              >
                                {email === currentUser?.email ? "You" : email}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {reminder.createdBy === currentUser?.email && (
                    <button
                      onClick={() => handleEditReminder(reminder)}
                      className="p-1 hover:bg-gray-700/50 rounded transition"
                      title="Edit reminder"
                    >
                      <Edit size={14} className="text-gray-400" />
                    </button>
                  )}
                  {reminder.createdBy === currentUser?.email && (
                    <button
                      onClick={() => handleDeleteReminder(reminder.id)}
                      className="p-1 hover:bg-gray-700/50 rounded transition"
                      title="Delete reminder"
                    >
                      <X size={14} className="text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
