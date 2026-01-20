"use client";
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Plus,
  Search,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ListTodo,
  MoreVertical,
  Edit,
  Trash2,
  ChevronDown,
  ExternalLink,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  getReminders,
  updateReminder,
  updateReminderStatus,
  deleteReminder,
  createReminder,
  type Reminder,
} from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { ReminderCard } from "./ReminderCard";
import { ReminderForm } from "./ReminderForm";
import { TaskDetailsModal } from "./TaskDetailsModal";

interface RemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  initialShowForm?: boolean;
  initialEditingReminder?: Reminder | null;
  forceShowCreateForm?: boolean; // Force show create form regardless of other conditions
  channelId?: string; // If provided, tasks will be associated with this channel
}

export function RemindersModal({
  isOpen,
  onClose,
  reminders,
  setReminders,
  initialShowForm = false,
  initialEditingReminder = null,
  forceShowCreateForm = false,
  channelId,
}: RemindersModalProps) {
  type TabType = "my-tasks" | "assigned-by-me" | "completed";

  interface GroupedReminders {
    overdue: Reminder[];
    today: Reminder[];
    upcoming: Reminder[];
    noDate: Reminder[];
  }
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("my-tasks");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Reminder | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);

  // Show form immediately when modal opens with initialShowForm, initialEditingReminder, or forceShowCreateForm
  useEffect(() => {
    if (isOpen) {
      if (initialEditingReminder) {
        setEditingReminder(initialEditingReminder);
        setShowForm(true);
      } else if (initialShowForm || forceShowCreateForm) {
        setEditingReminder(null);
        setShowForm(true);
      }
    }
  }, [isOpen, initialShowForm, initialEditingReminder, forceShowCreateForm]);

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
        if (isRefresh) {
          toast.error("Failed to refresh tasks");
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [setReminders]
  );

  // Initial fetch on open
  useEffect(() => {
    if (isOpen) {
      fetchReminders();
    }
  }, [isOpen, fetchReminders]);

  // Real-time subscription
  useEffect(() => {
    if (!isOpen || !currentUser?.email) return;

    const remindersChannel = supabase
      .channel("reminders-modal-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
        },
        async () => {
          // Refetch reminders on any change
          const allReminders = await getReminders();
          setReminders(allReminders);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminder_assignments",
        },
        async () => {
          // Refetch reminders on assignment changes
          const allReminders = await getReminders();
          setReminders(allReminders);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(remindersChannel);
    };
  }, [isOpen, currentUser?.email, setReminders]);

  // Filter reminders by tab
  const filteredByTab = useMemo(() => {
    const email = currentUser?.email?.toLowerCase() || "";

    switch (activeTab) {
      case "my-tasks":
        // Tasks assigned to me (pending)
        return reminders.filter(
          (r) =>
            r.assignedTo?.some((a) => a.toLowerCase() === email) &&
            r.status !== "done" &&
            r.status !== "hidden"
        );
      case "assigned-by-me":
        // Tasks I created for others (pending)
        return reminders.filter(
          (r) =>
            r.createdBy?.toLowerCase() === email &&
            r.status !== "done" &&
            r.status !== "hidden"
        );
      case "completed":
        // All completed tasks
        return reminders.filter((r) => r.status === "done");
      default:
        return reminders;
    }
  }, [reminders, activeTab, currentUser?.email]);

  // Filter by search query
  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return filteredByTab;

    const query = searchQuery.toLowerCase();
    return filteredByTab.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query)
    );
  }, [filteredByTab, searchQuery]);

  // Group reminders by due date
  const groupedReminders = useMemo((): GroupedReminders => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const groups: GroupedReminders = {
      overdue: [],
      today: [],
      upcoming: [],
      noDate: [],
    };

    filteredBySearch.forEach((reminder) => {
      if (!reminder.dueDate) {
        groups.noDate.push(reminder);
      } else {
        const dueDate = new Date(reminder.dueDate);
        if (dueDate < now && reminder.status !== "done") {
          groups.overdue.push(reminder);
        } else if (dueDate >= today && dueDate < tomorrow) {
          groups.today.push(reminder);
        } else {
          groups.upcoming.push(reminder);
        }
      }
    });

    // Sort each group by due date
    const sortByDate = (a: Reminder, b: Reminder) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    };

    groups.overdue.sort(sortByDate);
    groups.today.sort(sortByDate);
    groups.upcoming.sort(sortByDate);

    return groups;
  }, [filteredBySearch]);

  // Count for tabs
  const tabCounts = useMemo(() => {
    const email = currentUser?.email?.toLowerCase() || "";
    return {
      myTasks: reminders.filter(
        (r) =>
          r.assignedTo?.some((a) => a.toLowerCase() === email) &&
          r.status !== "done" &&
          r.status !== "hidden"
      ).length,
      assignedByMe: reminders.filter(
        (r) =>
          r.createdBy?.toLowerCase() === email &&
          r.status !== "done" &&
          r.status !== "hidden"
      ).length,
      completed: reminders.filter((r) => r.status === "done").length,
    };
  }, [reminders, currentUser?.email]);

  // Handle toggle complete
  const handleToggleComplete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;

    const isCreator = reminder.createdBy === currentUser?.email;
    const currentStatus = isCreator
      ? reminder.status
      : reminder.myStatus || reminder.status;
    const newStatus = currentStatus === "backlog" ? "done" : "backlog";

    setTogglingId(id);
    try {
      const updatedReminder = await updateReminderStatus(id, newStatus);
      if (updatedReminder) {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
      }
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Failed to update task");
    } finally {
      setTogglingId(null);
    }
  };

  // Handle edit
  const handleEdit = (reminder: Reminder) => {
    if (reminder.createdBy !== currentUser?.email) {
      toast.error("Only the creator can edit this task");
      return;
    }
    setEditingReminder(reminder);
    setShowForm(true);
    // Ensure we're on the first tab when editing
    setActiveTab("my-tasks");
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder || reminder.createdBy !== currentUser?.email) {
      toast.error("Only the creator can delete this task");
      return;
    }

    setDeletingId(id);
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast.success("Task deleted");
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast.error("Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  };

  // Handle form submit (create/update)
  const handleFormSubmit = async (data: {
    title: string;
    description: string;
    dueDate: string;
    assignedTo: string[];
    priority: "low" | "medium" | "high" | "urgent";
    channelId?: string;
    clientId?: string | null; // null means clear client association
    isRecurring?: boolean;
    rrule?: string;
  }) => {
    setIsSubmitting(true);
    try {
      if (editingReminder) {
        // Update existing reminder
        // Preserve null to clear client association, undefined means don't update
        const updated = await updateReminder(editingReminder.id, {
          title: data.title,
          description: data.description || undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          priority: data.priority,
          assignedTo: data.assignedTo.length > 0 ? data.assignedTo : undefined,
          channelId: data.channelId,
          clientId: data.clientId === null ? null : data.clientId || undefined,
          isRecurring: data.isRecurring,
          rrule: data.rrule,
        } as Parameters<typeof updateReminder>[1]);

        setReminders((prev) =>
          prev.map((r) => (r.id === editingReminder.id ? updated : r))
        );
        toast.success("Task updated");
      } else {
        // Create new reminder using the proper Supabase client function
        // For creates, null means no association, undefined also means no association
        const reminder = await createReminder({
          title: data.title,
          description: data.description || undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          priority: data.priority,
          assignedTo: data.assignedTo.length > 0 ? data.assignedTo : undefined,
          channelId: data.channelId || channelId || undefined,
          clientId: data.clientId || null,
        } as Parameters<typeof createReminder>[0]);

        setReminders((prev) => [reminder, ...prev]);
        toast.success("Task created");
      }

      setShowForm(false);
      setEditingReminder(null);
    } catch (error) {
      console.error("Error saving reminder:", error);
      toast.error(
        editingReminder ? "Failed to update task" : "Failed to create task",
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingReminder(null);
  };

  // Handle status update
  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setUpdatingStatusId(id);
    try {
      const updatedReminder = await updateReminderStatus(id, newStatus as "backlog" | "in_progress" | "review" | "done" | "hidden");
      if (updatedReminder) {
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
        toast.success(`Task status updated`);
      }
    } catch (error) {
      console.error("Error updating task status:", error);
      toast.error("Failed to update task status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Handle view task details
  const handleViewTaskDetails = (reminder: Reminder) => {
    setSelectedTaskForDetails(reminder);
    setShowTaskDetailsModal(true);
  };

  // Handle close task details modal
  const handleCloseTaskDetailsModal = () => {
    setSelectedTaskForDetails(null);
    setShowTaskDetailsModal(false);
  };

  // Render reminder group with quick actions
  const renderGroup = (
    label: string,
    icon: React.ReactNode,
    items: Reminder[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-6">
        <div
          className={`flex items-center gap-2 mb-3 text-sm font-medium ${colorClass}`}
        >
          {icon}
          <span>{label}</span>
          <span className="text-gray-500 text-xs">({items.length})</span>
        </div>
        <div className="space-y-3">
          {items.map((reminder) => {
            const isCreator = reminder.createdBy === currentUser?.email;
            const displayStatus = isCreator
              ? reminder.status
              : reminder.myStatus || reminder.status;
            const isCompleted = displayStatus === "done";
            const isUpdating = updatingStatusId === reminder.id;

            return (
              <motion.div
                key={reminder.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-gray-800/60 rounded-lg hover:bg-gray-800/80 transition-colors group p-4"
              >
                <div className="flex gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggleComplete(reminder.id)}
                    disabled={togglingId === reminder.id}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                      togglingId === reminder.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    } ${
                      isCompleted
                        ? "bg-purple-600 border-purple-600"
                        : "border-gray-500 hover:border-purple-500"
                    }`}
                  >
                    {togglingId === reminder.id ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : isCompleted ? (
                      <CheckCircle2 size={12} className="text-white" />
                    ) : null}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title with Priority */}
                    <div className="flex items-start gap-2">
                      <h3
                        className={`text-sm font-medium leading-tight flex-1 ${
                          isCompleted ? "text-gray-500 line-through" : "text-white"
                        }`}
                      >
                        {reminder.title}
                      </h3>
                      {/* Priority Badge */}
                      <div
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          reminder.priority === "urgent"
                            ? "bg-red-600 text-white"
                            : reminder.priority === "high"
                            ? "bg-orange-600 text-white"
                            : reminder.priority === "low"
                            ? "bg-green-600 text-white"
                            : "bg-gray-500 text-gray-300"
                        }`}
                      >
                        {reminder.priority.toUpperCase()}
                      </div>
                    </div>

                    {reminder.description && (
                      <p
                        className={`text-xs mt-1 line-clamp-2 ${
                          isCompleted ? "text-gray-600 line-through" : "text-gray-400"
                        }`}
                      >
                        {reminder.description}
                      </p>
                    )}

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      {/* Status Badge */}
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium text-white ${
                          displayStatus === "backlog"
                            ? "bg-gray-500"
                            : displayStatus === "in_progress"
                            ? "bg-blue-500"
                            : displayStatus === "review"
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                      >
                        {displayStatus === "backlog"
                          ? "Backlog"
                          : displayStatus === "in_progress"
                          ? "In Progress"
                          : displayStatus === "review"
                          ? "Review"
                          : "Done"}
                      </div>

                      {/* Due date */}
                      {reminder.dueDate && (
                        <div
                          className={`flex items-center gap-1 text-xs ${colorClass.replace(
                            "text-",
                            ""
                          )}`}
                        >
                          {label === "OVERDUE" ? (
                            <AlertCircle size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          <span>
                            {new Date(reminder.dueDate).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
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
                    {reminder.assignedTo && reminder.assignedTo.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {reminder.assignedTo.slice(0, 3).map((assignment) => {
                          const display =
                            assignment === currentUser?.email
                              ? "You"
                              : assignment.split("@")[0];
                          return (
                            <span
                              key={assignment}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                assignment === currentUser?.email
                                  ? "bg-purple-600/30 text-purple-300"
                                  : "bg-gray-700/50 text-gray-400"
                              }`}
                            >
                              <User size={10} />
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

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1">
                    {/* Status Update Dropdown */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // For now, just show a simple status toggle
                          const currentStatus = displayStatus;
                          const nextStatus =
                            currentStatus === "backlog"
                              ? "in_progress"
                              : currentStatus === "in_progress"
                              ? "review"
                              : currentStatus === "review"
                              ? "done"
                              : "backlog";
                          handleStatusUpdate(reminder.id, nextStatus);
                        }}
                        disabled={isUpdating}
                        className="p-1.5 rounded-lg opacity-50 group-hover:opacity-100 hover:bg-gray-700 transition-all cursor-pointer text-gray-400 hover:text-white"
                        title="Quick status update"
                      >
                        {isUpdating ? (
                          <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>

                    {/* Menu Button */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Could add a menu here with more options
                        }}
                        className="p-1.5 rounded-lg opacity-50 group-hover:opacity-100 hover:bg-gray-700 transition-all cursor-pointer"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl h-[90vh] sm:h-[85vh] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 p-3 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/80">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <ListTodo
                  size={18}
                  className="sm:w-[22px] sm:h-[22px] text-purple-400"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                  My Tasks
                </h2>
                <p className="text-xs text-gray-500">
                  {tabCounts.myTasks + tabCounts.assignedByMe} active tasks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={() => fetchReminders(true)}
                disabled={isRefreshing}
                className="p-2 sm:p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-50"
                title="Refresh tasks"
              >
                <RefreshCw
                  size={16}
                  className={isRefreshing ? "animate-spin" : ""}
                />
              </button>
              <button
                onClick={onClose}
                className="p-2 sm:p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex-shrink-0 p-3 sm:p-4 border-b border-gray-800 space-y-3 sm:space-y-4 bg-gray-900/50">
            {/* New Task Button + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setEditingReminder(null);
                  setShowForm(!showForm);
                }}
                className={`px-3 sm:px-4 py-2.5 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-2 ${
                  showForm
                    ? "bg-gray-700 text-gray-300"
                    : "bg-purple-600 hover:bg-purple-500 text-white"
                }`}
              >
                <Plus size={18} />
                <span>New Task</span>
              </button>

              <div className="flex-1 relative">
                <Search
                  size={18}
                  className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 sm:pl-11 pr-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 text-sm"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("my-tasks")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex-shrink-0 ${
                  activeTab === "my-tasks"
                    ? "bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/30"
                    : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
                }`}
              >
                My Tasks
                {tabCounts.myTasks > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-purple-600/30 rounded text-xs">
                    {tabCounts.myTasks}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("assigned-by-me")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex-shrink-0 ${
                  activeTab === "assigned-by-me"
                    ? "bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/30"
                    : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
                }`}
              >
                Assigned by Me
                {tabCounts.assignedByMe > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-purple-600/30 rounded text-xs">
                    {tabCounts.assignedByMe}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("completed")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer flex-shrink-0 ${
                  activeTab === "completed"
                    ? "bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/30"
                    : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
                }`}
              >
                Completed
                {tabCounts.completed > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-gray-600/30 rounded text-xs">
                    {tabCounts.completed}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Scrollable Content Area (Form + Task List) */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* New Task Form (Expandable) */}
            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-gray-800"
                >
                  <div className="p-4 relative">
                    <ReminderForm
                      initialData={editingReminder || undefined}
                      onSubmit={handleFormSubmit}
                      onCancel={handleCancelForm}
                      isSubmitting={isSubmitting}
                      channelId={channelId}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Task List */}
            <div className="p-4">
              {filteredBySearch.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-500">
                  <ListTodo size={48} className="mb-4 opacity-40" />
                  <p className="text-lg font-medium">No tasks found</p>
                  <p className="text-sm mt-1">
                    {searchQuery
                      ? "Try a different search term"
                      : activeTab === "completed"
                      ? "No completed tasks yet"
                      : "Click 'New Task' to create one"}
                  </p>
                </div>
              ) : activeTab === "completed" ? (
                // Completed tab - no grouping
                <div className="space-y-2">
                  {filteredBySearch.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      currentUserEmail={currentUser?.email || ""}
                      onToggleComplete={handleToggleComplete}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onViewDetails={handleViewTaskDetails}
                      onStatusUpdate={handleStatusUpdate}
                      isToggling={togglingId === reminder.id}
                      isDeleting={deletingId === reminder.id}
                      isUpdatingStatus={updatingStatusId === reminder.id}
                    />
                  ))}
                </div>
              ) : (
                // Active tasks - grouped by due date
                <>
                  {groupedReminders.overdue.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-red-400">
                        <AlertCircle size={16} />
                        <span>OVERDUE</span>
                        <span className="text-gray-500 text-xs">({groupedReminders.overdue.length})</span>
                      </div>
                      <div className="space-y-2">
                        {groupedReminders.overdue.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            currentUserEmail={currentUser?.email || ""}
                            onToggleComplete={handleToggleComplete}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                      onViewDetails={handleViewTaskDetails}
                            onStatusUpdate={handleStatusUpdate}
                            isToggling={togglingId === reminder.id}
                            isDeleting={deletingId === reminder.id}
                            isUpdatingStatus={updatingStatusId === reminder.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedReminders.today.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-amber-400">
                        <Clock size={16} />
                        <span>TODAY</span>
                        <span className="text-gray-500 text-xs">({groupedReminders.today.length})</span>
                      </div>
                      <div className="space-y-2">
                        {groupedReminders.today.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            currentUserEmail={currentUser?.email || ""}
                            onToggleComplete={handleToggleComplete}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                      onViewDetails={handleViewTaskDetails}
                      onStatusUpdate={handleStatusUpdate}
                            isToggling={togglingId === reminder.id}
                            isDeleting={deletingId === reminder.id}
                            isUpdatingStatus={updatingStatusId === reminder.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedReminders.upcoming.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-green-400">
                        <Calendar size={16} />
                        <span>UPCOMING</span>
                        <span className="text-gray-500 text-xs">({groupedReminders.upcoming.length})</span>
                      </div>
                      <div className="space-y-2">
                        {groupedReminders.upcoming.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            currentUserEmail={currentUser?.email || ""}
                            onToggleComplete={handleToggleComplete}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                      onViewDetails={handleViewTaskDetails}
                      onStatusUpdate={handleStatusUpdate}
                            isToggling={togglingId === reminder.id}
                            isDeleting={deletingId === reminder.id}
                            isUpdatingStatus={updatingStatusId === reminder.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedReminders.noDate.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-500">
                        <CheckCircle2 size={16} />
                        <span>NO DUE DATE</span>
                        <span className="text-gray-500 text-xs">({groupedReminders.noDate.length})</span>
                      </div>
                      <div className="space-y-2">
                        {groupedReminders.noDate.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            currentUserEmail={currentUser?.email || ""}
                            onToggleComplete={handleToggleComplete}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onViewDetails={handleViewTaskDetails}
                            onStatusUpdate={handleStatusUpdate}
                            isToggling={togglingId === reminder.id}
                            isDeleting={deletingId === reminder.id}
                            isUpdatingStatus={updatingStatusId === reminder.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Task Details Modal */}
      <TaskDetailsModal
        reminder={selectedTaskForDetails}
        isOpen={showTaskDetailsModal}
        onClose={handleCloseTaskDetailsModal}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleComplete={handleToggleComplete}
        onStatusUpdate={handleStatusUpdate}
        isToggling={togglingId === selectedTaskForDetails?.id}
        isDeleting={deletingId === selectedTaskForDetails?.id}
        isUpdatingStatus={updatingStatusId === selectedTaskForDetails?.id}
      />
    </AnimatePresence>
  );
}
