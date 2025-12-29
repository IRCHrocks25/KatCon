"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  User,
  Users,
  AlertCircle,
} from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";

interface ReminderCardProps {
  reminder: Reminder;
  currentUserEmail: string;
  onToggleComplete: (id: string) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onViewDetails?: (reminder: Reminder) => void;
  isToggling: boolean;
  isDeleting: boolean;
}

type Priority = "overdue" | "today" | "upcoming" | "no-date";

export function ReminderCard({
  reminder,
  currentUserEmail,
  onToggleComplete,
  onEdit,
  onDelete,
  onViewDetails,
  isToggling,
  isDeleting,
}: ReminderCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const isCreator = reminder.createdBy === currentUserEmail;
  const displayStatus = isCreator
    ? reminder.status
    : reminder.myStatus || reminder.status;
  const isCompleted = displayStatus === "done";

  // Determine priority based on due date
  const getPriority = (): Priority => {
    if (!reminder.dueDate) return "no-date";

    const now = new Date();
    const dueDate = new Date(reminder.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dueDate < now && !isCompleted) return "overdue";
    if (dueDate >= today && dueDate < tomorrow) return "today";
    return "upcoming";
  };

  const priority = getPriority();

  const priorityStyles: Record<Priority, string> = {
    overdue: "border-l-4 border-l-red-500",
    today: "border-l-4 border-l-amber-500",
    upcoming: "border-l-4 border-l-green-500",
    "no-date": "border-l-4 border-l-gray-600",
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
      const diffDays = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return `${diffDays} days ago`;
    }
    if (dueDate >= yesterday && dueDate < today) {
      return `Yesterday ${timeStr}`;
    }
    if (dueDate >= today && dueDate < tomorrow) {
      return `Today ${timeStr}`;
    }
    if (
      dueDate >= tomorrow &&
      dueDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
    ) {
      return `Tomorrow ${timeStr}`;
    }
    return dueDate.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAssignmentDisplay = (assignment: string) => {
    if (assignment.startsWith("team:")) {
      return {
        display: `${assignment.replace("team:", "")} Team`,
        isTeam: true,
      };
    }
    if (assignment === currentUserEmail) {
      return { display: "You", isTeam: false, isCurrentUser: true };
    }
    return {
      display: assignment.split("@")[0],
      isTeam: false,
      isCurrentUser: false,
    };
  };

  const getStatusDisplay = (status: string) => {
    const statusMap = {
      backlog: { label: "Backlog", color: "bg-gray-500" },
      in_progress: { label: "In Progress", color: "bg-blue-500" },
      review: { label: "Review", color: "bg-yellow-500" },
      done: { label: "Done", color: "bg-green-500" },
      pending: { label: "Pending", color: "bg-orange-500" },
      hidden: { label: "Hidden", color: "bg-red-500" },
    };

    return statusMap[status as keyof typeof statusMap] || { label: status, color: "bg-gray-500" };
  };

  const statusInfo = getStatusDisplay(displayStatus);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative bg-gray-800/60 rounded-lg
        ${priorityStyles[isCompleted ? "no-date" : priority]}
        ${isCompleted ? "opacity-60" : ""}
        hover:bg-gray-800/80 transition-colors group
        ${onViewDetails ? "cursor-pointer" : ""}
      `}
      onClick={() => {
        console.log("ReminderCard clicked:", reminder.id, onViewDetails);
        onViewDetails?.(reminder);
      }}
    >
      <div className="p-4 flex gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(reminder.id);
          }}
          disabled={isToggling}
          className={`
            mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0
            flex items-center justify-center transition
            ${isToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            ${
              isCompleted
                ? "bg-purple-600 border-purple-600"
                : "border-gray-500 hover:border-purple-500"
            }
          `}
        >
          {isToggling ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : isCompleted ? (
            <Check size={12} className="text-white" />
          ) : null}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-medium leading-tight ${
              isCompleted ? "text-gray-500 line-through" : "text-white"
            }`}
          >
            {reminder.title}
          </h3>

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
            <div className={`px-2 py-1 rounded text-xs font-medium text-white ${statusInfo.color}`}>
              {statusInfo.label}
            </div>

            {/* Due date */}
            {reminder.dueDate && (
              <div
                className={`flex items-center gap-1 text-xs ${
                  priority === "overdue" && !isCompleted
                    ? "text-red-400"
                    : priority === "today" && !isCompleted
                    ? "text-amber-400"
                    : "text-gray-500"
                }`}
              >
                {priority === "overdue" && !isCompleted ? (
                  <AlertCircle size={12} />
                ) : (
                  <Clock size={12} />
                )}
                <span>{formatDueDate(new Date(reminder.dueDate))}</span>
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
                    {isTeam ? <Users size={10} /> : <User size={10} />}
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

        {/* Actions Menu */}
        {isCreator && (
          <div className="relative flex-shrink-0 self-start">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-lg opacity-50 group-hover:opacity-100 hover:bg-gray-700 transition-all cursor-pointer"
            >
              <MoreVertical size={16} className="text-gray-400" />
            </button>

            {showMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-[100]"
                  onClick={() => setShowMenu(false)}
                />
                {/* Menu */}
                <div className="absolute right-0 top-8 z-[101] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[120px]">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(reminder);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(reminder.id);
                    }}
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
}
