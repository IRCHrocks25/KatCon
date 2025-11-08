"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Bell, Plus, X, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";

interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  completed: boolean;
}

export function RemindersContainer() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: "",
    description: "",
    dueDate: "",
  });

  const handleAddReminder = () => {
    if (!newReminder.title.trim()) {
      toast.error("Reminder title is required");
      return;
    }

    const reminder: Reminder = {
      id: Date.now().toString(),
      title: newReminder.title,
      description: newReminder.description || undefined,
      dueDate: newReminder.dueDate ? new Date(newReminder.dueDate) : undefined,
      completed: false,
    };

    setReminders((prev) => [...prev, reminder]);
    setNewReminder({ title: "", description: "", dueDate: "" });
    setIsAdding(false);
    toast.success("Reminder added");
  };

  const handleToggleComplete = (id: string) => {
    setReminders((prev) =>
      prev.map((reminder) =>
        reminder.id === id
          ? { ...reminder, completed: !reminder.completed }
          : reminder
      )
    );
  };

  const handleDeleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
    toast.success("Reminder deleted");
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
          onClick={() => setIsAdding(!isAdding)}
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
              if (e.key === "Enter") handleAddReminder();
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewReminder({ title: "", description: "", dueDate: "" });
              }
            }}
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newReminder.description}
            onChange={(e) =>
              setNewReminder({ ...newReminder, description: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
          <input
            type="datetime-local"
            value={newReminder.dueDate}
            onChange={(e) =>
              setNewReminder({ ...newReminder, dueDate: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddReminder}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
            >
              Add
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewReminder({ title: "", description: "", dueDate: "" });
              }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Reminders List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {reminders.length === 0 ? (
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
                reminder.completed
                  ? "bg-gray-800/30 border-gray-700/50 opacity-60"
                  : "bg-gray-800/50 border-gray-700/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => handleToggleComplete(reminder.id)}
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition ${
                    reminder.completed
                      ? "bg-purple-600 border-purple-600"
                      : "border-gray-600 hover:border-purple-500"
                  }`}
                >
                  {reminder.completed && (
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
                      reminder.completed
                        ? "text-gray-500 line-through"
                        : "text-white"
                    }`}
                  >
                    {reminder.title}
                  </h3>
                  {reminder.description && (
                    <p
                      className={`text-xs mt-1 ${
                        reminder.completed
                          ? "text-gray-600"
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
                </div>
                <button
                  onClick={() => handleDeleteReminder(reminder.id)}
                  className="p-1 hover:bg-gray-700/50 rounded transition"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

