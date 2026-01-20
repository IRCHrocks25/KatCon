"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Clock,
  User,
  Users,
  CheckCircle,
  Circle,
  Edit,
  Trash2,
  Hash,
  Building,
  ChevronDown,
} from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { useAuth } from "@/contexts/AuthContext";
import { useChannels } from "@/contexts/ChannelsContext";
import { useClients } from "@/contexts/ClientsContext";
import { TaskDeleteConfirmationModal } from "@/components/ui/TaskDeleteConfirmationModal";

interface TaskDetailsModalProps {
  reminder: Reminder | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (reminder: Reminder) => void;
  onDelete?: (id: string) => void;
  onToggleComplete?: (id: string) => void;
  onStatusUpdate?: (id: string, status: string) => void;
  isToggling?: boolean;
  isDeleting?: boolean;
  isUpdatingStatus?: boolean;
}

export function TaskDetailsModal({
  reminder,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  onStatusUpdate,
  isToggling = false,
  isDeleting = false,
  isUpdatingStatus = false,
}: TaskDetailsModalProps) {
  const { user } = useAuth();
  const { channels: availableChannels } = useChannels();
  const { clients } = useClients();
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  if (!reminder) return null;

  // Get channel information for this task
  const taskChannel = availableChannels?.find(channel => channel.id === reminder.channelId);

  // Get client information for this task
  const taskClient = clients.find(client => client.id === reminder.clientId);

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
            className="fixed inset-2 sm:inset-4 md:inset-8 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className={`border-l-4 ${getPriorityColor()} bg-gray-800/50`}>
              <div className="p-4 sm:p-6 flex items-start justify-between">
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
                    {/* Title with Priority and Channel Tag */}
                    <div className="flex items-start gap-3 flex-1">
                      <h2
                        className={`text-lg sm:text-xl font-semibold flex-1 ${
                          isCompleted ? "text-gray-500 line-through" : "text-white"
                        }`}
                      >
                        {reminder.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        {/* Priority Badge */}
                        <div className={`px-2 py-1 rounded-lg text-sm font-semibold ${
                          reminder.priority === "urgent"
                            ? "bg-red-600 text-white"
                            : reminder.priority === "high"
                            ? "bg-orange-600 text-white"
                            : reminder.priority === "low"
                            ? "bg-green-600 text-white"
                            : "bg-gray-600 text-white"
                        }`}>
                          {reminder.priority?.toUpperCase() || "MEDIUM"}
                        </div>

                        {/* Channel Tag - Only show if task belongs to a channel */}
                        {taskChannel && (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-purple-300 bg-purple-600/20 px-2.5 py-1 rounded-md border border-purple-600/30">
                            <Hash size={14} />
                            <span>{taskChannel.name || "Channel"}</span>
                          </div>
                        )}

                        {/* Client Tag - Only show if task belongs to a client */}
                        {taskClient && (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-green-300 bg-green-600/20 px-2.5 py-1 rounded-md border border-green-600/30">
                            <Building size={14} />
                            <span>{taskClient.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
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
                  {/* Status Update Dropdown - Available to all users */}
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      disabled={isUpdatingStatus}
                      className="hidden sm:flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition text-sm disabled:opacity-50"
                      title="Update status"
                    >
                      <span>Status</span>
                      <ChevronDown size={14} />
                    </button>

                    {showStatusDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-[100]"
                          onClick={() => setShowStatusDropdown(false)}
                        />
                        <div className="absolute right-0 top-8 z-[101] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[140px]">
                          {/* Status Update Options */}
                          <div className="px-3 py-2 border-b border-gray-700">
                            <p className="text-xs text-gray-500 font-medium mb-2">
                              Update Status
                            </p>
                            <div className="space-y-1">
                              {reminder.status !== "backlog" && (
                                <button
                                  onClick={() => {
                                    setShowStatusDropdown(false);
                                    onStatusUpdate?.(reminder.id, "backlog");
                                  }}
                                  disabled={isUpdatingStatus}
                                  className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2 cursor-pointer"
                                >
                                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                                  Backlog
                                </button>
                              )}
                              {reminder.status !== "in_progress" && (
                                <button
                                  onClick={() => {
                                    setShowStatusDropdown(false);
                                    onStatusUpdate?.(reminder.id, "in_progress");
                                  }}
                                  disabled={isUpdatingStatus}
                                  className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2 cursor-pointer"
                                >
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                  In Progress
                                </button>
                              )}
                              {reminder.status !== "review" && (
                                <button
                                  onClick={() => {
                                    setShowStatusDropdown(false);
                                    onStatusUpdate?.(reminder.id, "review");
                                  }}
                                  disabled={isUpdatingStatus}
                                  className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2 cursor-pointer"
                                >
                                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                  Review
                                </button>
                              )}
                              {reminder.status !== "done" && (
                                <button
                                  onClick={() => {
                                    setShowStatusDropdown(false);
                                    onStatusUpdate?.(reminder.id, "done");
                                  }}
                                  disabled={isUpdatingStatus}
                                  className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2 cursor-pointer"
                                >
                                  <div className="w-2 h-2 rounded-full bg-green-500" />
                                  Done
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {isCreator && (
                    <>
                      <button
                        onClick={() => onEdit?.(reminder)}
                        className="hidden sm:block p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
                        title="Edit task"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirmation(true)}
                        disabled={isDeleting}
                        className="hidden sm:block p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition disabled:opacity-50"
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-2 sm:pb-6 space-y-4 sm:space-y-6">
              {/* Description */}
              {reminder.description && (
                <div>
                  <h3 className="text-sm sm:text-base font-medium text-gray-300 mb-2">Description</h3>
                  <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4">
                    <p className={`text-sm leading-relaxed ${isCompleted ? "text-gray-500 line-through" : "text-gray-200"}`}>
                      {reminder.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Due Date */}
              {reminder.dueDate && (
                <div>
                  <h3 className="text-sm sm:text-base font-medium text-gray-300 mb-2">Due Date</h3>
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
                  <h3 className="text-sm sm:text-base font-medium text-gray-300 mb-3">Assigned To</h3>
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

          {/* Delete Confirmation Modal */}
          <TaskDeleteConfirmationModal
            isOpen={showDeleteConfirmation}
            onClose={() => setShowDeleteConfirmation(false)}
            onConfirm={() => {
              setShowDeleteConfirmation(false);
              onDelete?.(reminder.id);
            }}
            taskTitle={reminder.title}
            isDeleting={isDeleting}
          />
        </>
      )}
    </AnimatePresence>
  );
}
