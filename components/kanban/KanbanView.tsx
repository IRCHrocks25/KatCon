"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import type { Reminder } from "@/lib/supabase/reminders";
import { updateReminderKanban, getReminders } from "@/lib/supabase/reminders";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { TaskDetailsModal } from "@/components/reminders/TaskDetailsModal";

interface KanbanViewProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
}

type KanbanStatus = "backlog" | "in_progress" | "review" | "done";

const KANBAN_COLUMNS: { id: KanbanStatus; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "bg-gray-600" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-600" },
  { id: "review", title: "Review", color: "bg-yellow-600" },
  { id: "done", title: "Done", color: "bg-green-600" },
];

export function KanbanView({ reminders, setReminders }: KanbanViewProps) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Reminder | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load reminders when component mounts if not already loaded
  useEffect(() => {
    const loadRemindersIfNeeded = async () => {
      if (reminders.length === 0 && user && !isLoading) {
        try {
          setIsLoading(true);
          const fetchedReminders = await getReminders();
          setReminders(fetchedReminders);
        } catch (error) {
          console.error("Error loading reminders for Kanban:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadRemindersIfNeeded();
  }, [reminders.length, user, isLoading, setReminders]);

  // Filter to show tasks where user is creator OR assigned
  const userTasks = useMemo(() => {
    if (!user?.email) return [];

    // Show tasks where the current user is the creator OR explicitly assigned
    return reminders.filter((reminder) =>
      reminder.createdBy.toLowerCase() === user.email?.toLowerCase() ||
      reminder.assignedTo.some(
        (assignedEmail) =>
          assignedEmail.toLowerCase() === user.email?.toLowerCase()
      )
    );
  }, [reminders, user]);

  // Group tasks by status and sort by position
  const tasksByStatus = useMemo(() => {
    const grouped: Record<KanbanStatus, Reminder[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    };

    userTasks.forEach((reminder) => {
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

    // Sort each column by position, then by created date
    Object.keys(grouped).forEach((statusKey) => {
      const status = statusKey as KanbanStatus;
      grouped[status].sort((a, b) => {
        // Sort by position first
        if (a.position !== undefined && b.position !== undefined) {
          return a.position - b.position;
        }
        if (a.position !== undefined) return -1;
        if (b.position !== undefined) return 1;
        // Fallback to created date (newest first)
        return 0; // We don't have createdAt in the Reminder type
      });
    });

    return grouped;
  }, [userTasks]);

  const activeTask = activeId ? reminders.find((r) => r.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which column the active item is in
    const activeColumn = Object.keys(tasksByStatus).find((status) =>
      tasksByStatus[status as KanbanStatus].some((task) => task.id === activeId)
    ) as KanbanStatus;

    // Find which column the over item is in
    const overColumn = Object.keys(tasksByStatus).find((status) =>
      tasksByStatus[status as KanbanStatus].some((task) => task.id === overId)
    ) as KanbanStatus;

    if (!activeColumn || !overColumn) return;

    // If moving between columns, update the status
    if (activeColumn !== overColumn) {
      const updatedReminders = reminders.map((reminder) => {
        if (reminder.id === activeId) {
          return {
            ...reminder,
            status: overColumn,
            position: tasksByStatus[overColumn].length, // Add to end of new column
          };
        }
        return reminder;
      });

      setReminders(updatedReminders);
    } else {
      // Moving within the same column - reorder
      const columnTasks = tasksByStatus[activeColumn];
      const activeIndex = columnTasks.findIndex((task) => task.id === activeId);
      const overIndex = columnTasks.findIndex((task) => task.id === overId);

      if (activeIndex !== overIndex) {
        const reorderedTasks = arrayMove(columnTasks, activeIndex, overIndex);

        // Update positions
        const updatedReminders = reminders.map((reminder) => {
          const newIndex = reorderedTasks.findIndex(
            (task) => task.id === reminder.id
          );
          if (newIndex !== -1) {
            return { ...reminder, position: newIndex };
          }
          return reminder;
        });

        setReminders(updatedReminders);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    try {
      // Find the task and its new status
      const task = reminders.find((r) => r.id === activeId);
      if (!task) return;

      // Determine new status based on overId (which could be a task or column)
      let newStatus: KanbanStatus = task.status as KanbanStatus;

      // Check if overId is a column ID
      const column = KANBAN_COLUMNS.find((col) => col.id === overId);
      if (column) {
        newStatus = column.id;
      } else {
        // Find which column the over item is in
        const overColumn = Object.keys(tasksByStatus).find((status) =>
          tasksByStatus[status as KanbanStatus].some(
            (task) => task.id === overId
          )
        ) as KanbanStatus;

        if (overColumn) {
          newStatus = overColumn;
        }
      }

      // Calculate new position
      const columnTasks = tasksByStatus[newStatus] || [];
      let newPosition = columnTasks.length;

      // If moving within same column, maintain relative position
      if (newStatus === (task.status as KanbanStatus)) {
        const activeIndex = columnTasks.findIndex((t) => t.id === activeId);
        const overIndex = columnTasks.findIndex((t) => t.id === overId);
        if (activeIndex !== -1 && overIndex !== -1) {
          newPosition = overIndex;
        }
      }

      // Update in Supabase
      const updatedTask = await updateReminderKanban(
        activeId,
        newStatus,
        newPosition
      );

      if (updatedTask) {
        // Update local state
        setReminders((prev) =>
          prev.map((r) => (r.id === activeId ? updatedTask : r))
        );

        toast.success("Task moved successfully");
      }
    } catch (error) {
      console.error("Error updating task position:", error);
      toast.error("Failed to move task");

      // Revert optimistic update by refreshing reminders
      // In a real app, you'd have better error handling
      setReminders([...reminders]);
    }
  };

  const handleTaskClick = (task: Reminder) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setSelectedTask(null);
    setShowDetailsModal(false);
  };

  return (
    <div className="h-full w-full bg-gray-900/50 backdrop-blur-sm p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white mb-1">Kanban Board</h1>
        <p className="text-gray-400 text-sm">
          Drag and drop tasks to organize your workflow
        </p>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 h-[calc(100%-6rem)] overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              color={column.color}
              tasks={tasksByStatus[column.id]}
              onTaskClick={handleTaskClick}
              currentUserEmail={user?.email}
            />
          ))}
        </div>

          <DragOverlay>
            {activeTask ? (
              <div className="rotate-3 opacity-90">
                <KanbanCard task={activeTask} onClick={() => {}} isDragging />
              </div>
            ) : null}
          </DragOverlay>
      </DndContext>

      {/* Task Details Modal */}
      <TaskDetailsModal
        reminder={selectedTask}
        isOpen={showDetailsModal}
        onClose={handleCloseDetailsModal}
        onEdit={() => {}} // Not implemented in v1
        onDelete={() => {}} // Not implemented in v1
        onToggleComplete={() => {}} // Not implemented in v1
        isToggling={false}
        isDeleting={false}
      />
    </div>
  );
}
