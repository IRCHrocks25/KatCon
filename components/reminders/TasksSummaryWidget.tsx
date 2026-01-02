"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  ListTodo,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  AlertCircle,
  Clock,
  Calendar,
  RefreshCw,
  MoreVertical,
  Edit,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Reminder } from "@/lib/supabase/reminders";
import {
  getReminders,
  updateReminderStatus,
  deleteReminder,
} from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { TaskDetailsModal } from "./TaskDetailsModal";

interface TasksSummaryWidgetProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  onOpenModal: () => void;
  onOpenModalWithForm?: () => void;
  onEditTask?: (reminder: Reminder) => void;
  onViewTaskDetails?: (reminder: Reminder) => void;
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
  onOpenModalWithForm,
  onEditTask,
  onViewTaskDetails,
}: TasksSummaryWidgetProps) {
  const { user: currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);


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
    if (dueDate < now)
      return (
        1000 -
        Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60))
      );
    // Today: high priority
    if (dueDate >= today && dueDate < tomorrow) return 500;
    // Upcoming: medium priority (closer = higher)
    const daysUntil = Math.floor(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
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

  // Handle status update
  const handleStatusUpdate = async (id: string, newStatus: "backlog" | "in_progress" | "review" | "done" | "hidden") => {
    setTogglingId(id);
    setMenuOpenId(null);
    try {
      const updatedReminder = await updateReminderStatus(id, newStatus);
      if (updatedReminder) {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
        toast.success(`Task marked as ${getStatusDisplay(newStatus).label.toLowerCase()}`);
      }
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    } finally {
      setTogglingId(null);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder || reminder.createdBy !== currentUser?.email) {
      toast.error("Only the creator can delete this task");
      return;
    }

    setDeletingId(id);
    setMenuOpenId(null);
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast.success("Task deleted");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  };

  // Handle view details
  const handleViewDetails = (reminder: Reminder) => {
    console.log('Task card clicked:', reminder.id);
    onViewTaskDetails?.(reminder);
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
  const priorityStyles: Record<
    Priority,
    { border: string; icon: React.ReactNode; text: string }
  > = {
    overdue: {
      border: "border-l-red-500",
      icon: <AlertCircle size={14} className="text-red-400" />,
      text: "text-red-400",
    },
    today: {
      border: "border-l-amber-500",
      icon: <Clock size={14} className="text-amber-400" />,
      text: "text-amber-400",
    },
    upcoming: {
      border: "border-l-green-500",
      icon: <Calendar size={14} className="text-green-400" />,
      text: "text-green-400",
    },
    "no-date": {
      border: "border-l-gray-600",
      icon: null,
      text: "text-gray-500",
    },
  };

  // Get assignment display helper
  const getAssignmentDisplay = (assignment: string) => {
    if (assignment.startsWith("team:")) {
      return {
        display: `${assignment.replace("team:", "")} Team`,
        isTeam: true,
        isCurrentUser: false,
      };
    }
    if (assignment === currentUser?.email) {
      return { display: "You", isTeam: false, isCurrentUser: true };
    }
    return {
      display: assignment.split("@")[0],
      isTeam: false,
      isCurrentUser: false,
    };
  };

  // Get status display helper
  const getStatusDisplay = (status: string) => {
    const statusMap = {
      backlog: { label: "Backlog", color: "bg-gray-500" },
      in_progress: { label: "In Progress", color: "bg-blue-500" },
      review: { label: "Review", color: "bg-yellow-500" },
      done: { label: "Done", color: "bg-green-500" },
      hidden: { label: "Hidden", color: "bg-red-500" },
    };

    return statusMap[status as keyof typeof statusMap] || { label: status, color: "bg-gray-500" };
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
      initial={{ width: 320 }}
      animate={{ width: 320 }}
      className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo size={24} className="text-purple-400" />
            <h2 className="text-lg font-bold text-white">Tasks</h2>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 text-sm rounded font-medium">
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
                size={16}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition"
              title="Collapse"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={onOpenModal}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition"
              title="View all tasks"
            >
              <ExternalLink size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
            <ListTodo size={40} className="mb-3 opacity-40" />
            <p className="text-base">No pending tasks</p>
            <button
              onClick={onOpenModalWithForm || onOpenModal}
              className="mt-3 text-sm text-purple-400 hover:text-purple-300 transition"
            >
              + Add a task
            </button>
          </div>
        ) : (
          <>
            {visibleTasks.map(({ reminder, priority }) => {
              const styles = priorityStyles[priority];
              const isToggling = togglingId === reminder.id;
              const isCreator = reminder.createdBy === currentUser?.email;
              const isDeleting = deletingId === reminder.id;

              return (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`
                    relative bg-gray-800/60 rounded-lg border-l-4 ${styles.border}
                    hover:bg-gray-800/80 transition-colors group
                  `}
                >
                  <div className="p-4 flex gap-3">
                    {/* Status Indicator */}
                    <div className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${getStatusDisplay(reminder.status).color}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                  {/* Title with Priority */}
                  <div className="flex items-start gap-2">
                    <h3 className="text-sm font-medium leading-tight text-white flex-1">
                      {reminder.title}
                    </h3>
                    {/* Priority Badge */}
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      reminder.priority === "urgent"
                        ? "bg-red-600 text-white"
                        : reminder.priority === "high"
                        ? "bg-orange-600 text-white"
                        : reminder.priority === "low"
                        ? "bg-green-600 text-white"
                        : "bg-gray-500 text-gray-300"
                    }`}>
                      {reminder.priority.toUpperCase()}
                    </div>
                  </div>

                      {reminder.description && (
                        <p className="text-xs mt-1 line-clamp-2 text-gray-400">
                          {reminder.description}
                        </p>
                      )}

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                        {/* Status Badge */}
                        <div className={`px-2 py-1 rounded text-xs font-medium text-white ${getStatusDisplay(reminder.status).color}`}>
                          {getStatusDisplay(reminder.status).label}
                        </div>

                        {/* Due date */}
                        {reminder.dueDate && (
                          <div
                            className={`flex items-center gap-1 text-xs ${styles.text}`}
                          >
                            {priority === "overdue" ? (
                              <AlertCircle size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            <span>
                              {formatDueDate(
                                new Date(reminder.dueDate),
                                priority
                              )}
                            </span>
                          </div>
                        )}

                        {/* Created by (if not creator) */}
                        {!isCreator && reminder.createdBy && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <span>by {reminder.createdBy.split("@")[0]}</span>
                          </div>
                        )}
                      </div>

                      {/* Assignees */}
                      {reminder.assignedTo &&
                        reminder.assignedTo.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {reminder.assignedTo
                              .slice(0, 3)
                              .map((assignment) => {
                                const { display, isTeam, isCurrentUser } =
                                  getAssignmentDisplay(assignment);
                                return (
                                  <span
                                    key={assignment}
                                    className={`
                                  inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                                  ${
                                    isCurrentUser
                                      ? "bg-purple-600/30 text-purple-300"
                                      : isTeam
                                      ? "bg-blue-600/30 text-blue-300"
                                      : "bg-gray-700/50 text-gray-400"
                                  }
                                `}
                                  >
                                    {isTeam ? (
                                      <Users size={10} />
                                    ) : (
                                      <User size={10} />
                                    )}
                                    {display}
                                  </span>
                                );
                              })}
                            {reminder.assignedTo.length > 3 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-700/50 text-gray-400">
                                +{reminder.assignedTo.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                    </div>

                    {/* Menu Button */}
                    {isCreator && (
                      <div className="relative flex-shrink-0 self-start">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(
                              menuOpenId === reminder.id ? null : reminder.id
                            );
                          }}
                          className="p-1.5 rounded-lg opacity-50 group-hover:opacity-100 hover:bg-gray-700 transition-all"
                        >
                          <MoreVertical size={16} className="text-gray-400" />
                        </button>

                        {menuOpenId === reminder.id && (
                          <>
                            <div
                              className="fixed inset-0 z-[100]"
                              onClick={() => setMenuOpenId(null)}
                            />
                            <div className="absolute right-0 top-8 z-[101] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[160px]">
                              {/* Status Updates */}
                              <div className="px-3 py-2 border-b border-gray-700">
                                <p className="text-xs text-gray-500 font-medium mb-2">Update Status</p>
                                <div className="space-y-1">
                                  {reminder.status !== "backlog" && (
                                    <button
                                      onClick={() => handleStatusUpdate(reminder.id, "backlog")}
                                      disabled={isToggling}
                                      className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-gray-500" />
                                      Backlog
                                    </button>
                                  )}
                                  {reminder.status !== "in_progress" && (
                                    <button
                                      onClick={() => handleStatusUpdate(reminder.id, "in_progress")}
                                      disabled={isToggling}
                                      className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      In Progress
                                    </button>
                                  )}
                                  {reminder.status !== "review" && (
                                    <button
                                      onClick={() => handleStatusUpdate(reminder.id, "review")}
                                      disabled={isToggling}
                                      className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                      Review
                                    </button>
                                  )}
                                  {reminder.status !== "done" && (
                                    <button
                                      onClick={() => handleStatusUpdate(reminder.id, "done")}
                                      disabled={isToggling}
                                      className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-green-500" />
                                      Done
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <button
                                onClick={() => {
                                  setMenuOpenId(null);
                                  if (onEditTask) {
                                    onEditTask(reminder);
                                  } else {
                                    onOpenModal();
                                  }
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                              >
                                <Edit size={14} />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(reminder.id)}
                                disabled={isDeleting}
                                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                              >
                                {isDeleting ? (
                                  <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800/50 space-y-2">
        {remainingCount > 0 && (
          <button
            onClick={onOpenModal}
            className="w-full text-base text-purple-400 hover:text-purple-300 transition py-1"
          >
            View {remainingCount} more task{remainingCount > 1 ? "s" : ""}...
          </button>
        )}
        <button
          onClick={onOpenModalWithForm || onOpenModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-base font-medium transition"
        >
          <Plus size={18} />
          Add Task
        </button>
      </div>

    </motion.div>
  );
}
