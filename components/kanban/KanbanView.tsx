"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChannels } from "@/contexts/ChannelsContext";
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
import { Plus, Filter, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { Reminder } from "@/lib/supabase/reminders";
import { updateReminderKanban, getReminders } from "@/lib/supabase/reminders";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { TaskDetailsModal } from "@/components/reminders/TaskDetailsModal";
import { getConversations, type Conversation } from "@/lib/supabase/messaging";

interface KanbanViewProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  channelId?: string; // If provided, only show tasks for this channel
  onOpenTaskModal?: (editingReminder?: Reminder) => void; // Callback to open task creation modal
}

type KanbanStatus = "backlog" | "in_progress" | "review" | "done";

const KANBAN_COLUMNS: { id: KanbanStatus; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "bg-gray-600" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-600" },
  { id: "review", title: "Review", color: "bg-yellow-600" },
  { id: "done", title: "Done", color: "bg-green-600" },
];

export function KanbanView({
  reminders,
  setReminders,
  channelId,
  onOpenTaskModal,
}: KanbanViewProps) {
  const { user } = useAuth();
  const { channels: availableChannels } = useChannels();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Reminder | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>("all"); // "all" or channel ID
  const [showChannelFilter, setShowChannelFilter] = useState(false);

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

  // Filter to show tasks where user is creator OR assigned, and by channel filter
  const userTasks = useMemo(() => {
    if (!user?.email) return [];

    // Show tasks where the current user is the creator OR explicitly assigned
    let filteredTasks = reminders.filter(
      (reminder) =>
        reminder.createdBy.toLowerCase() === user.email?.toLowerCase() ||
        reminder.assignedTo.some(
          (assignedEmail) =>
            assignedEmail.toLowerCase() === user.email?.toLowerCase()
        )
    );

    // Apply channel filter
    if (channelFilter !== "all") {
      filteredTasks = filteredTasks.filter(
        (reminder) => reminder.channelId === channelFilter
      );
    }

    // If channelId is specified (when opened from channel kanban), further filter to only show tasks for this channel
    if (channelId) {
      filteredTasks = filteredTasks.filter(
        (reminder) => reminder.channelId === channelId
      );
    }

    return filteredTasks;
  }, [reminders, user, channelId, channelFilter]);

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
    // Open task details modal
    setSelectedTask(task);
    setShowTaskDetailsModal(true);
  };

  const handleCloseTaskDetailsModal = () => {
    setSelectedTask(null);
    setShowTaskDetailsModal(false);
  };

  const selectedChannelFilter = availableChannels.find(
    (c) => c.id === channelFilter
  );

  return (
    <div className="h-full w-full bg-gray-900/50 backdrop-blur-sm p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Kanban Board</h1>
            <p className="text-gray-400 text-sm">
              Click cards to view details • Drag and drop to organize
            </p>
          </div>

          {/* Channel Filter Dropdown - Only show when not in channel context */}
          {!channelId && (
            <div className="relative">
              <button
                onClick={() => setShowChannelFilter(!showChannelFilter)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700/50 transition"
              >
                <Filter size={16} />
                {channelFilter === "all"
                  ? "All Tasks"
                  : selectedChannelFilter?.name || "Channel"}
                <ChevronDown
                  size={14}
                  className={`transition-transform ${
                    showChannelFilter ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showChannelFilter && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                  <div className="p-2">
                    {/* All Tasks Option */}
                    <button
                      onClick={() => {
                        setChannelFilter("all");
                        setShowChannelFilter(false);
                      }}
                      className={`w-full px-3 py-2 text-left rounded transition ${
                        channelFilter === "all"
                          ? "bg-purple-600/20 text-purple-400"
                          : "text-gray-300 hover:bg-gray-700/50"
                      }`}
                    >
                      All Tasks
                    </button>

                    {/* Channel Options */}
                    {availableChannels.map((channel) => (
                      <button
                        key={channel.id}
                        onClick={() => {
                          setChannelFilter(channel.id);
                          setShowChannelFilter(false);
                        }}
                        className={`w-full px-3 py-2 text-left rounded transition ${
                          channelFilter === channel.id
                            ? "bg-purple-600/20 text-purple-400"
                            : "text-gray-300 hover:bg-gray-700/50"
                        }`}
                      >
                        {channel.name || "Unnamed Channel"}
                        {channel.isPrivate && (
                          <span className="text-xs text-gray-500 ml-2">
                            (Private)
                          </span>
                        )}
                      </button>
                    ))}

                    {availableChannels.length === 0 && (
                      <div className="px-3 py-2 text-gray-500 text-sm">
                        No channels available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Task Button - Always visible */}
        {onOpenTaskModal && (
          <button
            onClick={() => onOpenTaskModal()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition flex items-center gap-2 font-medium"
          >
            <Plus size={18} />
            Add Task
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-2 justify-evenly h-[calc(100%-6rem)] overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              color={column.color}
              tasks={tasksByStatus[column.id]}
              onTaskClick={handleTaskClick}
              currentUserEmail={user?.email}
              availableChannels={availableChannels}
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
        isOpen={showTaskDetailsModal}
        onClose={handleCloseTaskDetailsModal}
        onEdit={(reminder) => {
          // Open the edit modal via the callback
          onOpenTaskModal?.(reminder);
          setShowTaskDetailsModal(false);
        }}
        onDelete={(id) => {
          // Handle delete if needed
          setShowTaskDetailsModal(false);
        }}
        onToggleComplete={(id) => {
          // Handle toggle complete
          setShowTaskDetailsModal(false);
        }}
      />
    </div>
  );
}
