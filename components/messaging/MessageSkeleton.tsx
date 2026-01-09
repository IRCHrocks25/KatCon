"use client";

import { motion } from "motion/react";

interface MessageSkeletonProps {
  count?: number;
}

// Predefined skeleton patterns to avoid Math.random() during render
const SKELETON_PATTERNS = [
  { isOwn: false, width: 65, lines: 1, hasFile: false },
  { isOwn: false, width: 75, lines: 2, hasFile: false },
  { isOwn: true, width: 45, lines: 1, hasFile: false },
  { isOwn: false, width: 80, lines: 3, hasFile: false },
  { isOwn: true, width: 50, lines: 1, hasFile: false },
  { isOwn: false, width: 60, lines: 2, hasFile: true },
  { isOwn: true, width: 40, lines: 1, hasFile: false },
  { isOwn: false, width: 70, lines: 1, hasFile: false },
];

const LINE_WIDTHS = [
  [100], // 1 line
  [100, 70], // 2 lines
  [100, 85, 45], // 3 lines
];

export function MessageSkeleton({ count = 6 }: MessageSkeletonProps) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 custom-scrollbar">
      {Array.from({ length: count }).map((_, index) => {
        const pattern = SKELETON_PATTERNS[index % SKELETON_PATTERNS.length];
        const isOwnMessage = pattern.isOwn;
        const messageWidth = pattern.width;
        const lineWidths = LINE_WIDTHS[pattern.lines - 1] || LINE_WIDTHS[0];

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex items-start gap-3 ${
              isOwnMessage ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar Skeleton */}
            <div className="mt-5">
              <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
            </div>

            {/* Message Content Skeleton */}
            <div
              className={`flex flex-col max-w-[70%] ${
                isOwnMessage ? "items-end" : "items-start"
              }`}
            >
              {/* Name Skeleton */}
              <div
                className={`mb-1 ${
                  isOwnMessage ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`h-3 bg-gray-700 rounded animate-pulse ${
                    isOwnMessage ? "w-12 ml-auto" : "w-16"
                  }`}
                />
              </div>

              {/* Message Bubble Skeleton */}
              <div
                className={`px-4 py-2 rounded-2xl ${
                  isOwnMessage
                    ? "bg-gradient-to-r from-purple-600/50 via-pink-500/50 to-orange-500/50 rounded-tr-sm"
                    : "bg-gray-800/50 rounded-tl-sm border border-gray-700/50"
                }`}
                style={{ width: `${messageWidth}%` }}
              >
                {/* Text Content Skeleton */}
                <div className="space-y-1">
                  {lineWidths.map((width, lineIndex) => (
                    <div
                      key={lineIndex}
                      className="h-4 bg-white/20 rounded animate-pulse"
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </div>

                {/* File Attachment Skeleton (occasional) */}
                {pattern.hasFile && (
                  <div className="mt-2 p-2 bg-gray-700/30 rounded-lg flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-600 rounded animate-pulse" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-600 rounded animate-pulse w-20" />
                      <div className="h-2 bg-gray-600 rounded animate-pulse w-12 mt-1" />
                    </div>
                    <div className="w-4 h-4 bg-gray-600 rounded animate-pulse" />
                  </div>
                )}
              </div>

              {/* Timestamp Skeleton */}
              <div
                className={`mt-1 ${
                  isOwnMessage ? "text-right" : "text-left"
                }`}
              >
                <div className="h-2 bg-gray-700 rounded animate-pulse w-8" />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
