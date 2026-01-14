"use client";

import { motion } from "motion/react";
import { ListTodo } from "lucide-react";

// Predefined skeleton patterns for consistent animation
const TASK_PATTERNS = [
  {
    titleWidth: 32,
    descLines: 2,
    hasPriority: true,
    hasAssignees: true,
    assigneeCount: 2,
    statusColor: "bg-blue-500",
  },
  {
    titleWidth: 28,
    descLines: 1,
    hasPriority: false,
    hasAssignees: true,
    assigneeCount: 1,
    statusColor: "bg-green-500",
  },
  {
    titleWidth: 36,
    descLines: 3,
    hasPriority: true,
    hasAssignees: false,
    assigneeCount: 0,
    statusColor: "bg-yellow-500",
  },
  {
    titleWidth: 24,
    descLines: 1,
    hasPriority: false,
    hasAssignees: true,
    assigneeCount: 3,
    statusColor: "bg-red-500",
  },
  {
    titleWidth: 30,
    descLines: 2,
    hasPriority: true,
    hasAssignees: true,
    assigneeCount: 1,
    statusColor: "bg-purple-500",
  },
];

interface TasksSummaryWidgetSkeletonProps {
  taskCount?: number;
}

export function TasksSummaryWidgetSkeleton({
  taskCount = 5,
}: TasksSummaryWidgetSkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm border-r border-gray-800/50"
    >
      {/* Header Skeleton */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-700 rounded animate-pulse flex items-center justify-center">
              <ListTodo size={18} className="text-gray-600" />
            </div>
            <div className="h-5 bg-gray-700 rounded animate-pulse w-16" />
            <div className="h-5 bg-gray-700 rounded animate-pulse w-8" />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
            <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Task List Skeleton */}
      <div className="flex-1 overflow-hidden p-4 space-y-3">
        {Array.from({ length: Math.min(taskCount, TASK_PATTERNS.length) }).map((_, index) => {
          const pattern = TASK_PATTERNS[index % TASK_PATTERNS.length];

          return (
            <motion.div
              key={`task-skeleton-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="relative bg-gray-800/60 rounded-lg border-l-4 border-l-gray-600 p-4"
            >
              {/* Status Indicator */}
              <div className="absolute left-4 top-4 w-3 h-3 rounded-full bg-gray-600 animate-pulse" />

              {/* Content */}
              <div className="ml-6 space-y-3">
                {/* Title and Priority */}
                <div className="flex items-start gap-2">
                  <div
                    className="h-4 bg-gray-700 rounded animate-pulse flex-1"
                    style={{ width: `${pattern.titleWidth}px` }}
                  />
                  {pattern.hasPriority && (
                    <div className="h-4 bg-gray-600 rounded animate-pulse w-12" />
                  )}
                </div>

                {/* Description Lines */}
                <div className="space-y-1">
                  {Array.from({ length: pattern.descLines }).map((_, lineIndex) => (
                    <div
                      key={`desc-${lineIndex}`}
                      className="h-3 bg-gray-700 rounded animate-pulse"
                      style={{
                        width: lineIndex === pattern.descLines - 1
                          ? `${Math.random() * 40 + 50}%`
                          : "100%"
                      }}
                    />
                  ))}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3">
                  <div
                    className={`h-4 rounded animate-pulse px-2 ${pattern.statusColor}`}
                    style={{ width: "60px" }}
                  />
                  <div className="h-4 bg-gray-700 rounded animate-pulse w-20" />
                </div>

                {/* Assignees */}
                {pattern.hasAssignees && (
                  <div className="flex gap-1">
                    {Array.from({ length: pattern.assigneeCount }).map((_, assigneeIndex) => (
                      <div
                        key={`assignee-${assigneeIndex}`}
                        className="h-5 bg-gray-700 rounded animate-pulse"
                        style={{ width: `${Math.random() * 20 + 40}px` }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Menu Button */}
              <div className="absolute right-4 top-4 w-6 h-6 bg-gray-700 rounded animate-pulse" />
            </motion.div>
          );
        })}
      </div>

      {/* Footer Skeleton */}
      <div className="p-4 border-t border-gray-800/50">
        <div className="w-full h-10 bg-gray-700 rounded animate-pulse" />
      </div>
    </motion.div>
  );
}
