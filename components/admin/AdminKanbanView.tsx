"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Reminder } from "@/lib/supabase/reminders";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { TaskDetailsModal } from "@/components/reminders/TaskDetailsModal";
import { Loader2, Eye, X } from "lucide-react";

type KanbanStatus = "backlog" | "in_progress" | "review" | "done";

const KANBAN_COLUMNS: { id: KanbanStatus; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "bg-gray-600" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-600" },
  { id: "review", title: "Review", color: "bg-yellow-600" },
  { id: "done", title: "Done", color: "bg-green-600" },
];

interface AdminKanbanViewProps {
  userEmail: string | null;
  userName?: string;
  onClose: () => void;
}

export function AdminKanbanView({ userEmail, userName, onClose }: AdminKanbanViewProps) {
  const { session } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Reminder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Fetch reminders for the selected user
  useEffect(() => {
    const fetchReminders = async () => {
      if (!userEmail || !session?.access_token) return;

      setIsLoading(true);
      try {
        const url = userEmail
          ? `/api/admin/reminders?userEmail=${encodeURIComponent(userEmail)}`
          : "/api/admin/reminders";

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to fetch reminders");
        }

        const data = await response.json();
        setReminders(data.reminders || []);
      } catch (error) {
        console.error("Error fetching reminders:", error);
        toast.error("Failed to load kanban board");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReminders();
  }, [userEmail, session?.access_token]);

  // Group tasks by status and sort by position
  const tasksByStatus = useMemo(() => {
    const grouped: Record<KanbanStatus, Reminder[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    };

    reminders.forEach((reminder) => {
      // Map legacy statuses to Kanban statuses
      let status: KanbanStatus = "backlog";
      if (reminder.status === "in_progress") {
        status = "in_progress";
      } else if (reminder.status === "review") {
        status = "review";
      } else if (reminder.status === "done") {
        status = "done";
      }
      // pending and hidden statuses default to backlog

      grouped[status].push(reminder);
    });

    // Sort each column by position
    Object.keys(grouped).forEach((statusKey) => {
      const status = statusKey as KanbanStatus;
      grouped[status].sort((a, b) => {
        if (a.position !== undefined && b.position !== undefined) {
          return a.position - b.position;
        }
        if (a.position !== undefined) return -1;
        if (b.position !== undefined) return 1;
        return 0;
      });
    });

    return grouped;
  }, [reminders]);

  const handleTaskClick = (task: Reminder) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setSelectedTask(null);
    setShowDetailsModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-[95vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Eye className="text-purple-400" size={20} />
            <div>
              <h2 className="text-lg font-bold text-white">
                {userName ? `${userName}'s Kanban Board` : "Team Kanban Board"}
              </h2>
              <p className="text-sm text-gray-400">
                {userEmail || "All Users"} • View Only
              </p>
            </div>
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30">
              Read Only
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
            aria-label="Close"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={48}
                  className="mx-auto mb-4 text-purple-500 animate-spin"
                />
                <p className="text-gray-400">Loading kanban board...</p>
              </div>
            </div>
          ) : reminders.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 text-lg mb-2">No tasks found</p>
                <p className="text-gray-500 text-sm">
                  {userEmail
                    ? "This user doesn't have any tasks yet."
                    : "No tasks in the system."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 h-full overflow-x-auto pb-4">
              {KANBAN_COLUMNS.map((column) => (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={column.title}
                  color={column.color}
                  tasks={tasksByStatus[column.id]}
                  onTaskClick={handleTaskClick}
                  currentUserEmail={userEmail || undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Details Modal */}
      <TaskDetailsModal
        reminder={selectedTask}
        isOpen={showDetailsModal}
        onClose={handleCloseDetailsModal}
        onEdit={() => {}} // Not available in read-only mode
        onDelete={() => {}} // Not available in read-only mode
        onToggleComplete={() => {}} // Not available in read-only mode
        isToggling={false}
        isDeleting={false}
      />
    </div>
  );
}

