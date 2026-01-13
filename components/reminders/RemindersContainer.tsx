"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type React from "react";
import { motion } from "motion/react";
import {
  Bell,
  Plus,
  X,
  Calendar,
  User,
  Users,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  Check,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import {
  getReminders,
  updateReminder,
  updateReminderStatus,
  deleteReminder,
  type Reminder,
} from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";
import { getAllUsers, type UserWithTeam } from "@/lib/supabase/users";
import { robustFetch } from "@/lib/utils/fetch";
import type { AccountType } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { ReminderCard } from "./ReminderCard";

export type { Reminder };

interface RemindersContainerProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

type SortOption = "dueDate" | "createdDate" | "manual";

export function RemindersContainer({
  reminders,
  setReminders,
}: RemindersContainerProps) {
  const { user: currentUser } = useAuth();
  const { clients } = useClients();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("dueDate");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedTo: [] as string[],
    clientId: "",
  });
  const [allUsers, setAllUsers] = useState<UserWithTeam[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Reusable fetch function
  const fetchReminders = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        const fetchedReminders = await getReminders();
        setReminders(fetchedReminders);

        if (isRefresh) {
          toast.success("Reminders refreshed");
        }
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
        setIsRefreshing(false);
      }
    },
    [setReminders]
  );

  // Fetch users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const users = await getAllUsers();
        setAllUsers(users);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  // Fetch reminders on component mount (non-blocking)
  useEffect(() => {
    // Small delay to ensure page renders first
    const timeoutId = setTimeout(() => {
      fetchReminders(false);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [fetchReminders]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node)
      ) {
        setShowClientDropdown(false);
      }
    };

    if (showDropdown || showClientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown, showClientDropdown]);

  // Real-time subscription for reminders
  useEffect(() => {
    if (!currentUser?.email) {
      console.warn("[REMINDERS] No user email, skipping realtime subscription");
      return;
    }

    console.log(
      "[REMINDERS] Setting up realtime subscription for:",
      currentUser.email
    );

    // Subscribe to changes in reminders table
    const remindersChannel = supabase
      .channel("reminders-changes")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "reminders",
        },
        async (payload) => {
          console.log(
            "[REMINDERS] 🔔 Change received:",
            payload.eventType,
            payload
          );

          if (payload.eventType === "INSERT") {
            // New reminder created - fetch full details and add to list
            const newReminderId = payload.new.id;
            const allReminders = await getReminders();
            const newReminder = allReminders.find(
              (r) => r.id === newReminderId
            );

            if (newReminder) {
              setReminders((prev) => {
                // Check if already exists (prevent duplicates)
                if (prev.some((r) => r.id === newReminder.id)) return prev;
                return [newReminder, ...prev];
              });

              // Show toast if assigned to current user and created by someone else
              if (
                newReminder.assignedTo.includes(currentUser.email || "") &&
                newReminder.createdBy !== currentUser.email
              ) {
                toast.info("New reminder assigned to you", {
                  description: newReminder.title,
                  duration: 5000,
                });
              }
            }
          } else if (payload.eventType === "UPDATE") {
            // Reminder updated - fetch and update in list
            const updatedId = payload.new.id;
            const allReminders = await getReminders();
            const updatedReminder = allReminders.find(
              (r) => r.id === updatedId
            );

            if (updatedReminder) {
              setReminders((prev) =>
                prev.map((r) => (r.id === updatedId ? updatedReminder : r))
              );
            } else {
              // No longer visible to user (unassigned), remove it
              setReminders((prev) => prev.filter((r) => r.id !== updatedId));
            }
          } else if (payload.eventType === "DELETE") {
            // Reminder deleted - remove from list
            const deletedId = payload.old.id;
            setReminders((prev) => prev.filter((r) => r.id !== deletedId));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "reminder_assignments",
        },
        async (payload) => {
          console.log(
            "[REMINDERS] 🔔 Assignment change received:",
            payload.eventType,
            payload
          );

          if (payload.eventType === "INSERT") {
            // New assignment created - check if it's for the current user
            const assignmentData = payload.new as {
              reminder_id?: string;
              user_email?: string;
            };
            const reminderId = assignmentData?.reminder_id;
            const assignedUserEmail = assignmentData?.user_email?.toLowerCase();
            const currentUserEmail = currentUser?.email?.toLowerCase();

            // Check if this assignment is for the current user
            if (
              reminderId &&
              assignedUserEmail &&
              currentUserEmail &&
              assignedUserEmail === currentUserEmail
            ) {
              // Fetch all reminders (which will include the newly assigned one)
              const allReminders = await getReminders();
              const newReminder = allReminders.find((r) => r.id === reminderId);

              if (newReminder) {
                setReminders((prev) => {
                  // Check if already exists (prevent duplicates)
                  if (prev.some((r) => r.id === newReminder.id)) return prev;
                  return [newReminder, ...prev];
                });

                // Show toast if assigned by someone else
                if (newReminder.createdBy !== currentUserEmail) {
                  toast.info("New reminder assigned to you", {
                    description: newReminder.title,
                    duration: 5000,
                  });
                }
              }
            }
          } else {
            // For UPDATE/DELETE events, refresh the affected reminder
            const reminderId =
              (payload.new as { reminder_id?: string })?.reminder_id ||
              (payload.old as { reminder_id?: string })?.reminder_id;
            if (reminderId) {
              const allReminders = await getReminders();
              const updatedReminder = allReminders.find(
                (r) => r.id === reminderId
              );

              if (updatedReminder) {
                // Reminder is still visible to user, update it
                setReminders((prev) =>
                  prev.map((r) => (r.id === reminderId ? updatedReminder : r))
                );
              } else {
                // Reminder is no longer visible to user (they were unassigned), remove it
                setReminders((prev) => prev.filter((r) => r.id !== reminderId));
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("[REMINDERS] Realtime subscription status:", status);
      });

    return () => {
      console.log("[REMINDERS] Cleaning up realtime subscription");
      supabase.removeChannel(remindersChannel);
    };
  }, [currentUser?.email, setReminders]);

  // Sort reminders whenever sort option or reminders change
  const sortedReminders = [...reminders].sort((a, b) => {
    if (sortBy === "dueDate") {
      // Sort by dueDate (earliest first), then by created_at (newest first)
      if (a.dueDate && b.dueDate) {
        const dateDiff =
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dateDiff !== 0) return dateDiff;
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      // Fallback to created date (if available in extended reminder object)
      const aCreated =
        "createdAt" in a && typeof a.createdAt === "string"
          ? new Date(a.createdAt).getTime()
          : 0;
      const bCreated =
        "createdAt" in b && typeof b.createdAt === "string"
          ? new Date(b.createdAt).getTime()
          : 0;
      return bCreated - aCreated;
    } else if (sortBy === "createdDate") {
      // Sort by created date only (newest first)
      const aCreated =
        "createdAt" in a && typeof a.createdAt === "string"
          ? new Date(a.createdAt).getTime()
          : 0;
      const bCreated =
        "createdAt" in b && typeof b.createdAt === "string"
          ? new Date(b.createdAt).getTime()
          : 0;
      return bCreated - aCreated;
    }
    // Manual - keep original order
    return 0;
  });

  // Group users by account type
  const usersByTeam = allUsers.reduce((acc, user) => {
    if (!acc[user.accountType]) {
      acc[user.accountType] = [];
    }
    acc[user.accountType].push(user);
    return acc;
  }, {} as Record<AccountType, UserWithTeam[]>);

  const teamOptions = Object.keys(usersByTeam) as AccountType[];

  // Filter users and teams based on search query
  const filteredUsers = allUsers.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.fullname?.toLowerCase().includes(query) ||
      user.accountType.toLowerCase().includes(query)
    );
  });

  const filteredTeams = teamOptions.filter((team) =>
    team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleAssignment = (assignment: string) => {
    if (newReminder.assignedTo.includes(assignment)) {
      setNewReminder({
        ...newReminder,
        assignedTo: newReminder.assignedTo.filter((a) => a !== assignment),
      });
    } else {
      setNewReminder({
        ...newReminder,
        assignedTo: [...newReminder.assignedTo, assignment],
      });
    }
  };

  const handleRemoveAssignment = (assignment: string) => {
    setNewReminder({
      ...newReminder,
      assignedTo: newReminder.assignedTo.filter((a) => a !== assignment),
    });
  };

  // Helper to get display name for assignment
  const getAssignmentDisplay = (assignment: string) => {
    if (assignment.startsWith("team:")) {
      const teamName = assignment.replace("team:", "");
      return { display: `${teamName} Team`, isTeam: true };
    }
    return { display: assignment, isTeam: false };
  };

  const handleAddReminder = async () => {
    if (!newReminder.title.trim()) {
      toast.error("Reminder title is required");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        // Update existing reminder
        const updatedReminder = await updateReminder(editingId, {
          title: newReminder.title,
          description: newReminder.description || undefined,
          dueDate: newReminder.dueDate
            ? new Date(newReminder.dueDate)
            : undefined,
          priority: "medium", // Default priority for updates
          assignedTo:
            newReminder.assignedTo.length > 0
              ? newReminder.assignedTo
              : undefined,
        });

        setReminders((prev) =>
          prev.map((r) => (r.id === editingId ? updatedReminder : r))
        );
        toast.success("Reminder updated");
        setEditingId(null);
      } else {
        // Create new reminder using API route
        const response = await robustFetch("/api/reminders/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: newReminder.title,
            description: newReminder.description || undefined,
            dueDate: newReminder.dueDate
              ? new Date(newReminder.dueDate).toISOString()
              : undefined,
            assignedTo:
              newReminder.assignedTo.length > 0
                ? newReminder.assignedTo
                : undefined,
            clientId: newReminder.clientId || undefined,
            userEmail: currentUser?.email || null,
          }),
          retries: 0, // No retries for POST - prevents duplicate reminders on timeout
          timeout: 30000,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || errorData.details || "Failed to create reminder"
          );
        }

        const reminder = await response.json();

        // Add reminder and sort automatically
        setReminders((prev) => {
          const updated = [...prev, reminder];
          // Sort by dueDate (earliest first), then by created_at (newest first)
          return updated.sort((a, b) => {
            // If both have due dates, sort by due date (earliest first)
            if (a.dueDate && b.dueDate) {
              const dateDiff =
                new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
              if (dateDiff !== 0) return dateDiff;
            }
            // If only one has a due date, prioritize it
            if (a.dueDate && !b.dueDate) return -1;
            if (!a.dueDate && b.dueDate) return 1;
            // If neither has a due date or dates are equal, sort by created_at (newest first)
            // Use createdAt if available (from API), otherwise fall back to ID comparison
            const aCreated =
              "createdAt" in a && typeof a.createdAt === "string"
                ? new Date(a.createdAt).getTime()
                : 0;
            const bCreated =
              "createdAt" in b && typeof b.createdAt === "string"
                ? new Date(b.createdAt).getTime()
                : 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            // Fallback: keep original order for items without createdAt
            return 0;
          });
        });
        toast.success("Reminder added");
      }

      setNewReminder({
        title: "",
        description: "",
        dueDate: "",
        assignedTo: [],
        clientId: "",
      });
      setSearchQuery("");
      setIsAdding(false);
    } catch (error) {
      console.error("Error saving reminder:", error);
      toast.error(
        editingId ? "Failed to update reminder" : "Failed to add reminder",
        {
          description: error instanceof Error ? error.message : "Unknown error",
        }
      );
    } finally {
      setIsSaving(false);
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
          clientId: reminder.clientId || "",
        });
    setIsAdding(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewReminder({ title: "", description: "", dueDate: "", assignedTo: [], clientId: "" });
    setSearchQuery("");
    setShowDropdown(false);
    setIsAdding(false);
  };

  const handleToggleComplete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) {
      console.warn("[UI] Reminder not found:", id);
      return;
    }

    // Determine current status based on whether user is creator or assignee
    const isCreator = reminder.createdBy === currentUser?.email;
    const currentStatus = isCreator
      ? reminder.status
      : reminder.myStatus || reminder.status;
    const newStatus = currentStatus === "backlog" ? "done" : "backlog";

    console.log("[UI] Toggle clicked:", {
      id,
      isCreator,
      currentStatus,
      newStatus,
      reminder: {
        status: reminder.status,
        myStatus: reminder.myStatus,
        createdBy: reminder.createdBy,
        currentUserEmail: currentUser?.email,
      },
    });

    setTogglingId(id);
    try {
      const updatedReminder = await updateReminderStatus(id, newStatus);
      console.log("[UI] Update response:", updatedReminder);

      // Update the reminder in the list (keep it visible with strikethrough)
      if (updatedReminder) {
        console.log("[UI] Updating reminder in list with server data");
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? updatedReminder : r))
        );
      } else {
        // Fallback: update locally if we can't get the updated reminder
        console.warn("[UI] No updated reminder returned, updating locally");
        setReminders((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const isCreator = r.createdBy === currentUser?.email;
            return isCreator
              ? { ...r, status: newStatus }
              : { ...r, myStatus: newStatus };
          })
        );
      }
    } catch (error) {
      console.error("[UI] Error updating reminder status:", error);
      toast.error("Failed to update reminder", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    setDeletingId(id);
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
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewDetails = (reminder: Reminder) => {
    console.log('handleViewDetails called:', reminder.id);
    setSelectedReminder(reminder);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setSelectedReminder(null);
    setShowDetailsModal(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50">
      {/* Header */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Reminders</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchReminders(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh reminders"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={() => {
                if (isAdding) {
                  handleCancelEdit();
                } else {
                  setIsAdding(true);
                }
              }}
              className="p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition"
              title="Add reminder"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="flex-1 px-2 py-1.5 bg-gray-800/50 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
          >
            <option value="dueDate">Sort by Due Date</option>
            <option value="createdDate">Sort by Created Date</option>
            <option value="manual">Manual Order</option>
          </select>
        </div>
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
                setNewReminder({
                  title: "",
                  description: "",
                  dueDate: "",
                  assignedTo: [],
                  clientId: "",
                });
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
          {/* Assign to users/teams */}
          <div className="space-y-2 relative" ref={dropdownRef}>
            <label className="text-xs text-gray-400 flex items-center gap-1">
              <Users size={12} />
              Assign to (optional)
            </label>

            {/* Dropdown Trigger */}
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={isLoadingUsers}
              className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm text-left flex items-center justify-between hover:bg-gray-800/70 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-gray-400">
                {newReminder.assignedTo.length > 0
                  ? `${newReminder.assignedTo.length} selected`
                  : "Select users or teams"}
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  showDropdown ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col"
              >
                {/* Search Input */}
                <div className="p-2 border-b border-gray-700">
                  <input
                    type="text"
                    placeholder="Search users or teams..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    autoFocus
                  />
                </div>

                {/* Options List */}
                <div className="overflow-y-auto custom-scrollbar flex-1">
                  {isLoadingUsers ? (
                    <div className="p-4 text-center text-gray-400 text-sm">
                      <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-2" />
                      Loading...
                    </div>
                  ) : (
                    <>
                      {/* Teams Section */}
                      {filteredTeams.length > 0 && (
                        <div className="p-2">
                          <div className="text-xs text-gray-500 font-medium px-2 py-1">
                            TEAMS
                          </div>
                          {filteredTeams.map((team) => {
                            const teamAssignment = `team:${team}`;
                            const isSelected =
                              newReminder.assignedTo.includes(teamAssignment);
                            const memberCount = usersByTeam[team]?.length || 0;

                            return (
                              <button
                                key={team}
                                type="button"
                                onClick={() =>
                                  handleToggleAssignment(teamAssignment)
                                }
                                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-700/50 rounded transition text-left"
                              >
                                <div
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                    isSelected
                                      ? "bg-purple-600 border-purple-600"
                                      : "border-gray-600"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check size={12} className="text-white" />
                                  )}
                                </div>
                                <Users size={14} className="text-purple-400" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white font-medium">
                                    {team} Team
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {memberCount} members
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Individual Users Section */}
                      {filteredUsers.length > 0 && (
                        <div className="p-2">
                          {filteredTeams.length > 0 && (
                            <div className="text-xs text-gray-500 font-medium px-2 py-1 mt-2">
                              INDIVIDUAL USERS
                            </div>
                          )}
                          {filteredUsers.map((user) => {
                            const isSelected = newReminder.assignedTo.includes(
                              user.email
                            );

                            return (
                              <button
                                key={user.email}
                                type="button"
                                onClick={() =>
                                  handleToggleAssignment(user.email)
                                }
                                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-700/50 rounded transition text-left"
                              >
                                <div
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                    isSelected
                                      ? "bg-purple-600 border-purple-600"
                                      : "border-gray-600"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check size={12} className="text-white" />
                                  )}
                                </div>
                                <User size={14} className="text-gray-400" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white truncate">
                                    {user.fullname || user.email}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {user.fullname
                                      ? user.email
                                      : user.accountType}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-600 px-1.5 py-0.5 bg-gray-700/50 rounded">
                                  {user.accountType}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* No Results */}
                      {filteredTeams.length === 0 &&
                        filteredUsers.length === 0 && (
                          <div className="p-4 text-center text-gray-500 text-sm">
                            No users or teams found
                          </div>
                        )}
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* Selected Chips */}
            {newReminder.assignedTo.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newReminder.assignedTo.map((assignment) => {
                  const { display, isTeam } = getAssignmentDisplay(assignment);

                  return (
                    <div
                      key={assignment}
                      className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs"
                    >
                      {isTeam ? <Users size={10} /> : <User size={10} />}
                      <span>{display}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignment(assignment)}
                        className="hover:text-purple-100"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Client selection */}
          <div className="space-y-2 relative" ref={clientDropdownRef}>
            <label className="text-xs text-gray-400 flex items-center gap-1">
              <Building size={12} />
              Client (optional)
            </label>

            {/* Dropdown Trigger */}
            <button
              type="button"
              onClick={() => setShowClientDropdown(!showClientDropdown)}
              className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm text-left flex items-center justify-between hover:border-gray-500 transition"
            >
              <span className="text-gray-400">
                {newReminder.clientId
                  ? (() => {
                      const client = clients.find((c) => c.id === newReminder.clientId);
                      return client ? `${client.name}${client.company ? ` (${client.company})` : ''}` : "Select client";
                    })()
                  : "No client association"}
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  showClientDropdown ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {showClientDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute z-[100] w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-64 overflow-hidden flex flex-col"
              >
                {/* Search */}
                <div className="p-2 border-b border-gray-700">
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    autoFocus
                  />
                </div>

                {/* Options */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                  {/* No client option */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewReminder({ ...newReminder, clientId: "" });
                      setShowClientDropdown(false);
                    }}
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700/50 rounded transition"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        !newReminder.clientId
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-600"
                      }`}
                    >
                      {!newReminder.clientId && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm text-white font-medium">
                        No client association
                      </div>
                      <div className="text-xs text-gray-500">
                        Task not linked to any specific client
                      </div>
                    </div>
                  </button>

                  {/* Clients */}
                  {(() => {
                    const filteredClients = clients.filter((client) =>
                      client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                      client.company?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                      client.email?.toLowerCase().includes(clientSearchQuery.toLowerCase())
                    );

                    return filteredClients.length > 0 ? (
                      <div className="p-2">
                        <div className="text-xs text-gray-500 font-medium px-2 py-1 uppercase tracking-wider">
                          Clients
                        </div>
                        {filteredClients.map((client) => {
                          const isSelected = newReminder.clientId === client.id;

                          return (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => {
                                setNewReminder({ ...newReminder, clientId: client.id });
                                setShowClientDropdown(false);
                              }}
                              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700/50 rounded transition"
                            >
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  isSelected
                                    ? "bg-purple-600 border-purple-600"
                                    : "border-gray-600"
                                }`}
                              >
                                {isSelected && <Check size={12} className="text-white" />}
                              </div>
                              <Building size={16} className="text-blue-400" />
                              <div className="flex-1 text-left">
                                <div className="text-sm text-white font-medium">
                                  {client.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {client.company && `${client.company}`}
                                  {client.email && ` • ${client.email}`}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null;
                  })()}

                  {(() => {
                    const filteredClients = clients.filter((client) =>
                      client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                      client.company?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                      client.email?.toLowerCase().includes(clientSearchQuery.toLowerCase())
                    );

                    return filteredClients.length === 0 && clientSearchQuery && (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No clients found
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddReminder}
              disabled={isSaving}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {editingId ? "Saving..." : "Adding..."}
                </>
              ) : (
                <>{editingId ? "Save Changes" : "Add"}</>
              )}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
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
          sortedReminders.map((reminder) => {
            // Determine which status to display:
            // - If user is creator: use reminder.status (overall status)
            // - If user is assignee: use reminder.myStatus (their personal status)
            return (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                currentUserEmail={currentUser?.email || ""}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditReminder}
                onDelete={handleDeleteReminder}
                onViewDetails={handleViewDetails}
                isToggling={togglingId === reminder.id}
                isDeleting={deletingId === reminder.id}
              />
            );
          })
        )}
      </div>

      {/* Task Details Modal */}
      <TaskDetailsModal
        reminder={selectedReminder}
        isOpen={showDetailsModal}
        onClose={handleCloseDetailsModal}
        onEdit={handleEditReminder}
        onDelete={handleDeleteReminder}
        onToggleComplete={handleToggleComplete}
        isToggling={togglingId === selectedReminder?.id}
        isDeleting={deletingId === selectedReminder?.id}
      />
    </div>
  );
}
