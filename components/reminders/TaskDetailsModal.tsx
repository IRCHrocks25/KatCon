"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Clock,
  User,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Circle,
  Edit,
  Trash2,
} from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";

interface TaskDetailsModalProps {
  reminder: Reminder | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (reminder: Reminder) => void;
  onDelete?: (id: string) => void;
  onToggleComplete?: (id: string) => void;
  isToggling?: boolean;
  isDeleting?: boolean;
}

export function TaskDetailsModal({
  reminder,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  isToggling = false,
  isDeleting = false,
}: TaskDetailsModalProps) {
  const { user } = useAuth();

  if (!reminder) return null;

  const isCreator = reminder.createdBy === user?.email;
  const displayStatus = isCreator
    ? reminder.status
    : reminder.myStatus || reminder.status;
  const isCompleted = displayStatus === "done";

  const getStatusDisplay = (status: string) => {
    const statusMap = {
      backlog: { label: "Backlog", color: "bg-gray-600/20 text-gray-300" },
      in_progress: { label: "In Progress", color: "bg-blue-600/20 text-blue-400" },
      review: { label: "Review", color: "bg-yellow-600/20 text-yellow-400" },
      done: { label: "Completed", color: "bg-green-600/20 text-green-400" },
      hidden: { label: "Hidden", color: "bg-red-600/20 text-red-400" },
    };

    return statusMap[status as keyof typeof statusMap] || { label: status, color: "bg-gray-600/20 text-gray-300" };
  };

  const formatDueDate = (date: Date) => {
    const now = new Date();
    const dueDate = new Date(date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeStr = dueDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (dueDate < yesterday) {
      const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return `${diffDays} days ago at ${timeStr}`;
    }
    if (dueDate >= yesterday && dueDate < today) {
      return `Yesterday at ${timeStr}`;
    }
    if (dueDate >= today && dueDate < tomorrow) {
      return `Today at ${timeStr}`;
    }
    if (dueDate >= tomorrow && dueDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
      return `Tomorrow at ${timeStr}`;
    }
    return dueDate.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAssignmentDisplay = (assignment: string) => {
    if (assignment.startsWith("team:")) {
      return { display: `${assignment.replace("team:", "")} Team`, isTeam: true };
    }
    if (assignment === user?.email) {
      return { display: "You", isTeam: false, isCurrentUser: true };
    }
    return { display: assignment.split("@")[0], isTeam: false, isCurrentUser: false };
  };

  const getPriorityColor = () => {
    if (!reminder.dueDate) return "border-gray-600";
    const now = new Date();
    const dueDate = new Date(reminder.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dueDate < now && !isCompleted) return "border-red-500";
    if (dueDate >= today && dueDate < tomorrow) return "border-amber-500";
    return "border-green-500";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-w-2xl mx-auto"
          >
            {/* Header */}
            <div className={`border-l-4 ${getPriorityColor()} bg-gray-800/50`}>
              <div className="p-6 flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => onToggleComplete?.(reminder.id)}
                      disabled={isToggling}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                        isCompleted
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-500 hover:border-purple-500"
                      } ${isToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {isToggling ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : isCompleted ? (
                        <CheckCircle size={16} className="text-white" />
                      ) : (
                        <Circle size={16} className="text-gray-400" />
                      )}
                    </button>
                    <h2
                      className={`text-xl font-semibold ${
                        isCompleted ? "text-gray-500 line-through" : "text-white"
                      }`}
                    >
                      {reminder.title}
                    </h2>
                  </div>

                  {/* Status and Creator */}
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusDisplay(displayStatus).color}`}
                    >
                      {getStatusDisplay(displayStatus).label}
                    </span>
                    {reminder.createdBy && (
                      <span>
                        Created by{" "}
                        {reminder.createdBy === user?.email
                          ? "you"
                          : reminder.createdBy.split("@")[0]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCreator && (
                    <>
                      <button
                        onClick={() => onEdit?.(reminder)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
                        title="Edit task"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => onDelete?.(reminder.id)}
                        disabled={isDeleting}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition disabled:opacity-50"
                        title="Delete task"
                      >
                        {isDeleting ? (
                          <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={18} />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Description */}
              {reminder.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Description</h3>
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <p className={`text-sm leading-relaxed ${isCompleted ? "text-gray-500 line-through" : "text-gray-200"}`}>
                      {reminder.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Due Date */}
              {reminder.dueDate && (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Due Date</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock size={16} className="text-gray-400" />
                    <span className={isCompleted ? "text-gray-500" : "text-white"}>
                      {formatDueDate(new Date(reminder.dueDate))}
                    </span>
                  </div>
                </div>
              )}

              {/* Assignees */}
              {reminder.assignedTo && reminder.assignedTo.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Assigned To</h3>
                  <div className="space-y-2">
                    {reminder.assignedTo.map((assignment) => {
                      const { display, isTeam, isCurrentUser } = getAssignmentDisplay(assignment);
                      return (
                        <div
                          key={assignment}
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            isCurrentUser
                              ? "bg-purple-600/10 border border-purple-600/20"
                              : isTeam
                              ? "bg-blue-600/10 border border-blue-600/20"
                              : "bg-gray-800/50 border border-gray-700/50"
                          }`}
                        >
                          <div className={`p-2 rounded-full ${
                            isCurrentUser
                              ? "bg-purple-600/20"
                              : isTeam
                              ? "bg-blue-600/20"
                              : "bg-gray-700/50"
                          }`}>
                            {isTeam ? (
                              <Users size={16} className={isCurrentUser ? "text-purple-400" : "text-blue-400"} />
                            ) : (
                              <User size={16} className={isCurrentUser ? "text-purple-400" : "text-gray-400"} />
                            )}
                          </div>
                          <div>
                            <span className={`font-medium ${isCurrentUser ? "text-purple-300" : "text-white"}`}>
                              {display}
                            </span>
                            {!isTeam && !isCurrentUser && (
                              <div className="text-xs text-gray-500">{assignment}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="border-t border-gray-700/50 pt-4">
                <div className="text-xs text-gray-500">
                  <span className="text-gray-400">ID:</span> {reminder.id}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
