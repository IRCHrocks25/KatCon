"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clock,
  Calendar,
  AlertCircle,
  X,
  ChevronRight,
  Plus,
  KanbanSquare,
  ListTodo,
} from "lucide-react";
import type { Reminder } from "@/lib/supabase/reminders";
import { getStorageItem, setStorageItem } from "@/lib/utils/storage";

interface LoginStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminders: Reminder[];
  userFullname?: string;
  onViewTasks: () => void;
  onCreateTask: () => void;
  onGoToKanban: () => void;
}

interface TaskCounts {
  backlog: number;
  in_progress: number;
  review: number;
  done: number;
  overdue: number;
}

export function LoginStatusModal({
  isOpen,
  onClose,
  reminders,
  userFullname,
  onViewTasks,
  onCreateTask,
  onGoToKanban,
}: LoginStatusModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Check if user has opted out of seeing this modal
  useEffect(() => {
    if (isOpen) {
      const hasOptedOut = getStorageItem("login_status_modal_disabled") === "true";
      if (hasOptedOut) {
        onClose();
      }
    }
  }, [isOpen, onClose]);

  // Handle closing with preference saving
  const handleClose = () => {
    if (dontShowAgain) {
      setStorageItem("login_status_modal_disabled", "true");
    }
    onClose();
  };

  // Calculate task counts and stats
  const taskCounts: TaskCounts = (() => {
    const now = new Date();
    const counts: TaskCounts = {
      backlog: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      overdue: 0,
    };

    reminders.forEach((reminder) => {
      // Count by status
      if (reminder.status === "backlog") counts.backlog++;
      else if (reminder.status === "in_progress") counts.in_progress++;
      else if (reminder.status === "review") counts.review++;
      else if (reminder.status === "done") counts.done++;

      // Check for overdue tasks
      if (reminder.dueDate && reminder.status !== "done") {
        const dueDate = new Date(reminder.dueDate);
        if (dueDate < now) {
          counts.overdue++;
        }
      }
    });

    return counts;
  })();

  const upcomingDeadlines = (() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const deadlines: Array<{ reminder: Reminder; priority: 'overdue' | 'today' | 'upcoming'; dueDate: Date }> = [];

    reminders.forEach((reminder) => {
      // Collect upcoming deadlines
      if (reminder.dueDate && reminder.status !== "done") {
        const dueDate = new Date(reminder.dueDate);
        let priority: 'overdue' | 'today' | 'upcoming';

        if (dueDate < now) priority = 'overdue';
        else if (dueDate >= today && dueDate < tomorrow) priority = 'today';
        else if (dueDate >= tomorrow && dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
          priority = 'upcoming';
        } else {
          return; // Skip tasks more than a week away
        }

        deadlines.push({ reminder, priority, dueDate });
      }
    });

    // Sort deadlines by urgency (overdue first, then by date)
    deadlines.sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityOrder = { overdue: 0, today: 1, upcoming: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return deadlines.slice(0, 3); // Show top 3
  })();

  const formatDeadline = (deadline: typeof upcomingDeadlines[0]) => {
    const { priority, dueDate } = deadline;

    if (priority === 'overdue') {
      const daysAgo = Math.floor((new Date().getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return 'Earlier today';
      if (daysAgo === 1) return 'Yesterday';
      return `${daysAgo} days ago`;
    }

    if (priority === 'today') {
      return `Today at ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dueDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return dueDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getPriorityIcon = (priority: 'overdue' | 'today' | 'upcoming') => {
    switch (priority) {
      case 'overdue':
        return <AlertCircle size={16} className="text-red-400" />;
      case 'today':
        return <Clock size={16} className="text-amber-400" />;
      case 'upcoming':
        return <Calendar size={16} className="text-green-400" />;
    }
  };

  const totalActiveTasks = taskCounts.backlog + taskCounts.in_progress + taskCounts.review;

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
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md w-full max-h-[90vh] md:max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Welcome back
                  {userFullname ? `, ${userFullname.split(" ")[0]}` : ""}!
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Here&apos;s what&apos;s on your plate today
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Task Summary */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <ListTodo size={16} />
                  Task Summary
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Active</span>
                      <span className="text-lg font-bold text-purple-400">
                        {totalActiveTasks}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Completed</span>
                      <span className="text-lg font-bold text-green-400">
                        {taskCounts.done}
                      </span>
                    </div>
                  </div>
                  {taskCounts.overdue > 0 && (
                    <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400 flex items-center gap-1">
                          <AlertCircle size={12} />
                          Overdue
                        </span>
                        <span className="text-lg font-bold text-red-400">
                          {taskCounts.overdue}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Deadlines */}
              {upcomingDeadlines.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <Clock size={16} />
                    Upcoming Deadlines
                  </h3>
                  <div className="space-y-2">
                    {upcomingDeadlines.map((deadline, index) => (
                      <div
                        key={deadline.reminder.id}
                        className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition cursor-pointer"
                        onClick={() => {
                          handleClose();
                          onViewTasks();
                        }}
                      >
                        {getPriorityIcon(deadline.priority)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {deadline.reminder.title}
                          </p>
                          <p
                            className={`text-xs ${
                              deadline.priority === "overdue"
                                ? "text-red-400"
                                : deadline.priority === "today"
                                ? "text-amber-400"
                                : "text-green-400"
                            }`}
                          >
                            {formatDeadline(deadline)}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className="text-gray-500 flex-shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => {
                      handleClose();
                      onViewTasks();
                    }}
                    className="flex items-center gap-3 p-3 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-600/20 rounded-lg text-left transition cursor-pointer"
                  >
                    <ListTodo size={18} className="text-purple-400" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        View All Tasks
                      </p>
                      <p className="text-xs text-gray-400">
                        See your complete task list
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleClose();
                      onCreateTask();
                    }}
                    className="flex items-center gap-3 p-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 rounded-lg text-left transition cursor-pointer"
                  >
                    <Plus size={18} className="text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Create New Task
                      </p>
                      <p className="text-xs text-gray-400">
                        Add a task to your list
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleClose();
                      onGoToKanban();
                    }}
                    className="flex items-center gap-3 p-3 bg-green-600/10 hover:bg-green-600/20 border border-green-600/20 rounded-lg text-left transition cursor-pointer"
                  >
                    <KanbanSquare size={18} className="text-green-400" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Open Kanban Board
                      </p>
                      <p className="text-xs text-gray-400">
                        Visualize your workflow
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-600 focus:ring-2"
                />
                <span className="text-sm text-gray-400">
                  Don&apos;t show this again
                </span>
              </label>

              <button
                onClick={handleClose}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition cursor-pointer"
              >
                Got it!
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
