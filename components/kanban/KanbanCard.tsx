"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, MessageSquare, Clock, AlertTriangle } from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { isStaleTask, snoozeTask } from "@/lib/supabase/reminders";
import { toast } from "sonner";
import { useState } from "react";

interface KanbanCardProps {
  task: Reminder;
  onClick: () => void;
  isDragging?: boolean;
  currentUserEmail?: string;
}

export function KanbanCard({ task, onClick, isDragging = false, currentUserEmail }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const [isSnoozing, setIsSnoozing] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDueDate = (date: Date | undefined) => {
    if (!date) return null;

    const now = new Date();
    const dueDate = new Date(date);
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)} days overdue`, color: "text-red-400" };
    } else if (diffDays === 0) {
      return { text: "Due today", color: "text-yellow-400" };
    } else if (diffDays === 1) {
      return { text: "Due tomorrow", color: "text-yellow-400" };
    } else if (diffDays <= 7) {
      return { text: `Due in ${diffDays} days`, color: "text-blue-400" };
    } else {
      return { text: dueDate.toLocaleDateString(), color: "text-gray-400" };
    }
  };

  const dueDateInfo = formatDueDate(task.dueDate);
  const isStale = isStaleTask(task);

  // Check if current user is creator but not assigned to this task
  const isCreatorNotAssigned = currentUserEmail &&
    task.createdBy.toLowerCase() === currentUserEmail.toLowerCase() &&
    !task.assignedTo.some(email => email.toLowerCase() === currentUserEmail.toLowerCase());

  const handleSnooze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSnoozing(true);
    try {
      await snoozeTask(task.id);
      toast.success("Task snoozed for 3 days");
    } catch (error) {
      console.error("Error snoozing task:", error);
      toast.error("Failed to snooze task");
    } finally {
      setIsSnoozing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-700/50 border border-gray-600 rounded-lg p-4 cursor-pointer hover:bg-gray-600/50 hover:border-gray-500 transition-all relative ${
        isDragging || isSortableDragging ? "opacity-50 shadow-lg rotate-2" : ""
      }`}
      onClick={onClick}
    >
      {/* Stale Badge */}
      {isStale && (
        <div className="absolute -top-1 -right-1 bg-amber-600/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
          <Clock size={8} />
          Stale
        </div>
      )}

      {/* Task Title */}
      <h4 className="text-white font-medium text-sm mb-2 line-clamp-2">
        {task.title}
      </h4>

      {/* Task Description Preview */}
      {task.description && (
        <p className="text-gray-400 text-xs mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Task Metadata */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Due Date */}
          {dueDateInfo && (
            <div className={`flex items-center gap-1 text-xs ${dueDateInfo.color}`}>
              <Calendar size={12} />
              <span>{dueDateInfo.text}</span>
            </div>
          )}

          {/* Message Origin Indicator */}
          {task.createdBy !== task.assignedTo[0] && (
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <MessageSquare size={12} />
              <span>From chat</span>
            </div>
          )}
        </div>

        {/* Assignee Avatar Placeholder */}
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
            {task.assignedTo[0]?.charAt(0).toUpperCase() || "?"}
          </div>
          {/* Creator but not assigned indicator */}
          {isCreatorNotAssigned && (
            <div className="text-xs text-amber-400 font-medium" title="You created this task but it's assigned to someone else">
              →
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions for Stale Tasks (hover) */}
      {isStale && !isDragging && !isSortableDragging && (
        <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(); // Open task details
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded font-medium transition"
          >
            Open
          </button>
          <button
            onClick={handleSnooze}
            disabled={isSnoozing}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-2 py-1 rounded font-medium transition disabled:opacity-50"
          >
            {isSnoozing ? "..." : "Snooze"}
          </button>
        </div>
      )}
    </div>
  );
}
