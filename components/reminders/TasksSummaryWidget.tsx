"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListTodo,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Check,
  AlertCircle,
  Clock,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { Reminder } from "@/lib/supabase/reminders";
import {
  getReminders,
  updateReminderStatus,
} from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";

interface TasksSummaryWidgetProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  onOpenModal: () => void;
}

type Priority = "overdue" | "today" | "upcoming" | "no-date";

interface PrioritizedTask {
  reminder: Reminder;
  priority: Priority;
  score: number;
}

export function TasksSummaryWidget({
  reminders,
  setReminders,
  onOpenModal,
}: TasksSummaryWidgetProps) {
  const { user: currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch reminders
  const fetchReminders = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setIsRefreshing(true);
        }
        const fetchedReminders = await getReminders();
        setReminders(fetchedReminders);
        if (isRefresh) {
          toast.success("Tasks refreshed");
        }
      } catch (error) {
        console.error("Error fetching reminders:", error);
      } finally {
        setIsRefreshing(false);
      }
    },
    [setReminders]
  );

  // Initial fetch
  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Real-time subscription
  useEffect(() => {
    if (!currentUser?.email) return;

    const channel = supabase
      .channel("tasks-widget-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        async () => {
          const allReminders = await getReminders();
          setReminders(allReminders);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminder_assignments" },
        async () => {
          const allReminders = await getReminders();
          setReminders(allReminders);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.email, setReminders]);

  // Get priority score for sorting (higher = more urgent)
  const getPriorityScore = (reminder: Reminder): number => {
    if (!reminder.dueDate) return 0;

    const now = new Date();
    const dueDate = new Date(reminder.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Overdue: highest priority
    if (dueDate < now) return 1000 - Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60));
    // Today: high priority
    if (dueDate >= today && dueDate < tomorrow) return 500;
    // Upcoming: medium priority (closer = higher)
    const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(100 - daysUntil, 1);
  };

  // Get priority category
  const getPriority = (reminder: Reminder): Priority => {
    if (!reminder.dueDate) return "no-date";

    const now = new Date();
    const dueDate = new Date(reminder.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dueDate < now) return "overdue";
    if (dueDate >= today && dueDate < tomorrow) return "today";
    return "upcoming";
  };

  // Smart prioritized list - up to 5 most urgent tasks
  const { visibleTasks, remainingCount, pendingCount } = useMemo(() => {
    const pending = reminders.filter(
      (r) => r.status !== "done" && r.status !== "hidden"
    );

    const prioritized: PrioritizedTask[] = pending.map((reminder) => ({
      reminder,
      priority: getPriority(reminder),
      score: getPriorityScore(reminder),
    }));

    // Sort by score (descending)
    prioritized.sort((a, b) => b.score - a.score);

    return {
      visibleTasks: prioritized.slice(0, 5),
      remainingCount: Math.max(0, prioritized.length - 5),
      pendingCount: pending.length,
    };
  }, [reminders]);

  // Handle toggle complete
  const handleToggleComplete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;

    const isCreator = reminder.createdBy === currentUser?.email;
    const currentStatus = isCreator
      ? reminder.status
      : reminder.myStatus || reminder.status;
    const newStatus = currentStatus === "pending" ? "done" : "pending";

    setTogglingId(id);
    try {
      const updatedReminder = await updateReminderStatus(id, newStatus);
      if (updatedReminder) {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
      }
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    } finally {
      setTogglingId(null);
    }
  };

  // Format due date
  const formatDueDate = (date: Date, priority: Priority) => {
    const dueDate = new Date(date);
    const now = new Date();

    if (priority === "overdue") {
      const diffDays = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === 0) return "Earlier today";
      if (diffDays === 1) return "Yesterday";
      return `${diffDays} days ago`;
    }

    if (priority === "today") {
      return dueDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (
      dueDate.getDate() === tomorrow.getDate() &&
      dueDate.getMonth() === tomorrow.getMonth()
    ) {
      return "Tomorrow";
    }

    return dueDate.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Priority styles
  const priorityStyles: Record<Priority, { border: string; icon: React.ReactNode; text: string }> = {
    overdue: {
      border: "border-l-red-500",
      icon: <AlertCircle size={12} className="text-red-400" />,
      text: "text-red-400",
    },
    today: {
      border: "border-l-amber-500",
      icon: <Clock size={12} className="text-amber-400" />,
      text: "text-amber-400",
    },
    upcoming: {
      border: "border-l-green-500",
      icon: <Calendar size={12} className="text-green-400" />,
      text: "text-green-400",
    },
    "no-date": {
      border: "border-l-gray-600",
      icon: null,
      text: "text-gray-500",
    },
  };

  // Collapsed state
  if (!isExpanded) {
    return (
      <motion.button
        initial={{ width: 56 }}
        animate={{ width: 56 }}
        onClick={() => setIsExpanded(true)}
        className="h-full flex flex-col items-center justify-start pt-4 bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50 hover:bg-gray-800/50 transition relative"
        title="Expand tasks"
      >
        <div className="relative">
          <ListTodo size={24} className="text-purple-400" />
          {pendingCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-purple-600 rounded-full text-white text-xs flex items-center justify-center font-semibold">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </div>
        <ChevronRight size={16} className="text-gray-500 mt-2" />
      </motion.button>
    );
  }

  // Expanded state
  return (
    <motion.div
      initial={{ width: 280 }}
      animate={{ width: 280 }}
      className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo size={20} className="text-purple-400" />
            <h2 className="text-base font-semibold text-white">Tasks</h2>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded font-medium">
                {pendingCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchReminders(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={14}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition"
              title="Collapse"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={onOpenModal}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition"
              title="View all tasks"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
            <ListTodo size={32} className="mb-3 opacity-40" />
            <p className="text-sm">No pending tasks</p>
            <button
              onClick={onOpenModal}
              className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition"
            >
              + Add a task
            </button>
          </div>
        ) : (
          <>
            {visibleTasks.map(({ reminder, priority }) => {
              const styles = priorityStyles[priority];
              const isToggling = togglingId === reminder.id;

              return (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`group bg-gray-800/40 rounded-lg border-l-4 ${styles.border} p-2.5 hover:bg-gray-800/60 transition`}
                >
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleComplete(reminder.id)}
                      disabled={isToggling}
                      className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-500 hover:border-purple-500 flex items-center justify-center transition flex-shrink-0 disabled:opacity-50"
                    >
                      {isToggling && (
                        <div className="w-2 h-2 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-tight line-clamp-2">
                        {reminder.title}
                      </p>
                      {reminder.dueDate && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${styles.text}`}>
                          {styles.icon}
                          <span>{formatDueDate(new Date(reminder.dueDate), priority)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800/50 space-y-2">
        {remainingCount > 0 && (
          <button
            onClick={onOpenModal}
            className="w-full text-sm text-purple-400 hover:text-purple-300 transition py-1"
          >
            View {remainingCount} more task{remainingCount > 1 ? "s" : ""}...
          </button>
        )}
        <button
          onClick={onOpenModal}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm font-medium transition"
        >
          <Plus size={16} />
          Add Task
        </button>
      </div>
    </motion.div>
  );
}

