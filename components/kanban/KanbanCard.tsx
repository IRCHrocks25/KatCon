"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, MessageSquare, Clock, Hash, Building } from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { isStaleTask } from "@/lib/supabase/reminders";
import type { Conversation } from "@/lib/supabase/messaging";
import type { Client } from "@/lib/supabase/clients";

interface KanbanCardProps {
  task: Reminder;
  onClick: () => void;
  isDragging?: boolean;
  currentUserEmail?: string;
  availableChannels?: Conversation[];
  availableClients?: Client[];
  isUpdating?: boolean;
}

export function KanbanCard({ task, onClick, isDragging = false, currentUserEmail, availableChannels, availableClients, isUpdating = false }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });



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
    task.createdBy?.toLowerCase() === currentUserEmail.toLowerCase() &&
    !task.assignedTo.some(email => email?.toLowerCase() === currentUserEmail.toLowerCase());

  // Get channel information for this task
  const taskChannel = availableChannels?.find(channel => channel.id === task.channelId);

  // Get client information for this task
  const taskClient = availableClients?.find(client => client.id === task.clientId);



  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-700/50 border border-gray-600 rounded-lg p-3 md:p-4 cursor-pointer hover:bg-gray-600/50 hover:border-gray-500 transition-all relative ${
        isDragging || isSortableDragging ? "opacity-50 shadow-lg rotate-2" : ""
      } ${isUpdating ? "pointer-events-none" : ""}`}
      onClick={isUpdating ? undefined : onClick}
    >
      {/* Stale Badge */}
      {isStale && (
        <div className="absolute -top-1 -right-1 bg-amber-600/80 text-white text-[9px] md:text-[10px] px-1 md:px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
          <Clock size={7} className="md:w-2 md:h-2" />
          <span className="hidden sm:inline">Stale</span>
        </div>
      )}

      {/* Task Title with Priority and Channel Tag */}
      <div className="flex items-start gap-1.5 md:gap-2 mb-2">
        <h4 className="text-white font-medium text-xs md:text-sm flex-1 line-clamp-2">
          {task.title}
        </h4>
        <div className="flex items-center gap-1">
          {/* Priority Indicator */}
          <div className={`px-1 md:px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-semibold ${
            task.priority === "urgent"
              ? "bg-red-600 text-white"
              : task.priority === "high"
              ? "bg-orange-600 text-white"
              : task.priority === "low"
              ? "bg-green-600 text-white"
              : "bg-gray-500 text-gray-300"
          }`}>
            {task.priority?.toUpperCase() || "MEDIUM"}
          </div>

          {/* Channel Tag - Only show if task belongs to a channel */}
          {taskChannel && (
            <div className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-purple-300 bg-purple-600/20 px-1 md:px-1.5 py-0.5 rounded border border-purple-600/30">
              <Hash size={8} className="md:w-2.5 md:h-2.5" />
              <span className="hidden sm:inline">{taskChannel.name || "Channel"}</span>
            </div>
          )}

          {/* Client Tag - Only show if task belongs to a client */}
          {taskClient && (
            <div className="flex items-center gap-1 text-[10px] md:text-xs font-medium text-green-300 bg-green-600/20 px-1 md:px-1.5 py-0.5 rounded border border-green-600/30">
              <Building size={8} className="md:w-2.5 md:h-2.5" />
              <span className="hidden sm:inline">{taskClient.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Task Description Preview */}
      {task.description && (
        <p className="text-gray-400 text-[10px] md:text-xs mb-2 md:mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Task Metadata */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Due Date */}
          {dueDateInfo && (
            <div className={`flex items-center gap-1 text-[10px] md:text-xs ${dueDateInfo.color}`}>
              <Calendar size={10} className="md:w-3 md:h-3" />
              <span>{dueDateInfo.text}</span>
            </div>
          )}

          {/* Message Origin Indicator */}
          {task.createdBy && task.createdBy !== task.assignedTo[0] && (
            <div className="flex items-center gap-1 text-[10px] md:text-xs text-blue-400">
              <MessageSquare size={10} className="md:w-3 md:h-3" />
              <span className="hidden sm:inline">From chat</span>
            </div>
          )}
        </div>

        {/* Assignee Avatar Placeholder */}
        <div className="flex items-center gap-1">
          <div className="w-5 h-5 md:w-6 md:h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-[10px] md:text-xs font-semibold">
            {task.assignedTo[0]?.charAt(0)?.toUpperCase() || "?"}
          </div>
          {/* Creator but not assigned indicator */}
          {isCreatorNotAssigned && (
            <div className="text-[10px] md:text-xs text-amber-400 font-medium" title="You created this task but it's assigned to someone else">
              →
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {isUpdating && (
        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      )}

    </div>
  );
}
