"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Reminder } from "@/lib/supabase/reminders";
import type { Conversation } from "@/lib/supabase/messaging";
import { KanbanCard } from "@/components/kanban/KanbanCard";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  tasks: Reminder[];
  onTaskClick: (task: Reminder) => void;
  currentUserEmail?: string;
  availableChannels?: Conversation[];
}

export function KanbanColumn({ id, title, color, tasks, onTaskClick, currentUserEmail, availableChannels }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-64 md:min-w-72 max-w-xs bg-gray-800/50 rounded-lg border-2 transition-colors ${
        isOver
          ? "border-purple-500 bg-purple-900/20"
          : "border-gray-700 hover:border-gray-600"
      }`}
    >
      {/* Column Header */}
      <div className="p-3 md:p-4 border-b border-gray-700">
        <div className="flex items-center gap-2 md:gap-3">
          <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${color}`} />
          <h3 className="text-white font-semibold text-base md:text-lg">{title}</h3>
          <span className="bg-gray-700 text-gray-300 text-xs md:text-sm px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="p-2 h-[calc(100%-4rem)] md:h-[calc(100%-5rem)] overflow-y-auto custom-scrollbar">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
                currentUserEmail={currentUserEmail}
                availableChannels={availableChannels}
              />
            ))}
          </div>
        </SortableContext>

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <div className="text-2xl mb-2">📝</div>
              <p className="text-sm">No tasks</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
