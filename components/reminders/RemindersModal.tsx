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
import { robustFetch } from "@/lib/utils/fetch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { ReminderCard } from "./ReminderCard";
import { ReminderForm } from "./ReminderForm";

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
  }) => {
    setIsSubmitting(true);
    try {
      if (editingReminder) {
        // Update existing reminder
        const updated = await updateReminder(editingReminder.id, {
          title: data.title,
          description: data.description || undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          priority: data.priority,
          assignedTo: data.assignedTo.length > 0 ? data.assignedTo : undefined,
        });

        setReminders((prev) =>
          prev.map((r) => (r.id === editingReminder.id ? updated : r))
        );
        toast.success("Task updated");
      } else {
        // Create new reminder using the proper Supabase client function
        const reminder = await createReminder({
          title: data.title,
          description: data.description || undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          priority: data.priority,
          assignedTo: data.assignedTo.length > 0 ? data.assignedTo : undefined,
          channelId: channelId || undefined,
        });

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

  // Render reminder group
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
        <div className="space-y-2">
          {items.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              currentUserEmail={currentUser?.email || ""}
              onToggleComplete={handleToggleComplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewDetails={undefined} // Disable view details modal in list view
              isToggling={togglingId === reminder.id}
              isDeleting={deletingId === reminder.id}
            />
          ))}
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
          className="w-full max-w-3xl h-[85vh] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <ListTodo size={22} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">My Tasks</h2>
                <p className="text-xs text-gray-500">
                  {tabCounts.myTasks + tabCounts.assignedByMe} active tasks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchReminders(true)}
                disabled={isRefreshing}
                className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-50"
                title="Refresh tasks"
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? "animate-spin" : ""}
                />
              </button>
              <button
                onClick={onClose}
                className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex-shrink-0 p-4 border-b border-gray-800 space-y-4 bg-gray-900/50">
            {/* New Task Button + Search */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingReminder(null);
                  setShowForm(!showForm);
                }}
                className={`px-4 py-2.5 rounded-xl font-medium transition cursor-pointer flex items-center gap-2 ${
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
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 text-sm"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("my-tasks")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
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
                className={`px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
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
                className={`px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
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
                      onViewDetails={undefined} // Disable view details modal in list view
                      isToggling={togglingId === reminder.id}
                      isDeleting={deletingId === reminder.id}
                    />
                  ))}
                </div>
              ) : (
                // Active tasks - grouped by due date
                <>
                  {renderGroup(
                    "OVERDUE",
                    <AlertCircle size={16} />,
                    groupedReminders.overdue,
                    "text-red-400"
                  )}
                  {renderGroup(
                    "TODAY",
                    <Clock size={16} />,
                    groupedReminders.today,
                    "text-amber-400"
                  )}
                  {renderGroup(
                    "UPCOMING",
                    <Calendar size={16} />,
                    groupedReminders.upcoming,
                    "text-green-400"
                  )}
                  {renderGroup(
                    "NO DUE DATE",
                    <CheckCircle2 size={16} />,
                    groupedReminders.noDate,
                    "text-gray-500"
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
