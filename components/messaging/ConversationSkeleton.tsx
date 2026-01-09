"use client";

import { motion } from "motion/react";
import { Hash } from "lucide-react";

// Predefined skeleton patterns to avoid Math.random() during render
const CHANNEL_PATTERNS = [
  { nameWidth: 24, hasBadge: false, hasUnread: true, unreadCount: 3 },
  { nameWidth: 32, hasBadge: true, hasUnread: false, unreadCount: 0 },
  { nameWidth: 28, hasBadge: false, hasUnread: true, unreadCount: 12 },
  { nameWidth: 36, hasBadge: true, hasUnread: false, unreadCount: 0 },
  { nameWidth: 20, hasBadge: false, hasUnread: false, unreadCount: 0 },
];

const DM_PATTERNS = [
  { nameWidth: 28, hasStatus: true, hasUnread: true, unreadCount: 2 },
  { nameWidth: 24, hasStatus: false, hasUnread: false, unreadCount: 0 },
  { nameWidth: 32, hasStatus: true, hasUnread: true, unreadCount: 5 },
  { nameWidth: 22, hasStatus: false, hasUnread: false, unreadCount: 0 },
  { nameWidth: 30, hasStatus: true, hasUnread: false, unreadCount: 0 },
];

const MESSAGE_WIDTHS = [65, 75, 55, 80, 45, 70, 60];

interface ConversationSkeletonProps {
  showChannels?: boolean;
  showDMs?: boolean;
  channelCount?: number;
  dmCount?: number;
}

export function ConversationSkeleton({
  showChannels = true,
  showDMs = true,
  channelCount = 4,
  dmCount = 3,
}: ConversationSkeletonProps) {
  return (
    <nav className="flex-1 overflow-y-auto custom-scrollbar" aria-label="Conversations loading">
      {/* Channels Section */}
      {showChannels && (
        <div className="p-2">
          <div className="px-2 py-1 mb-2">
            <div className="h-3 bg-gray-700 rounded animate-pulse w-16" />
          </div>
          {Array.from({ length: channelCount }).map((_, index) => {
            const pattern = CHANNEL_PATTERNS[index % CHANNEL_PATTERNS.length];
            const messageWidth = MESSAGE_WIDTHS[index % MESSAGE_WIDTHS.length];

            return (
              <motion.div
                key={`channel-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="w-full p-3 rounded-lg mb-1"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 bg-gray-700 rounded animate-pulse flex items-center justify-center">
                    <Hash size={12} className="text-gray-600" />
                  </div>
                  <div
                    className="h-4 bg-gray-700 rounded animate-pulse flex-1"
                    style={{ width: `${pattern.nameWidth}px` }}
                  />
                  {pattern.hasBadge && (
                    <div className="h-3 bg-gray-600 rounded-full animate-pulse px-2" />
                  )}
                  {pattern.hasUnread && (
                    <div className="h-4 bg-purple-600 rounded-full animate-pulse px-2" />
                  )}
                </div>
                <div className="ml-6">
                  <div
                    className="h-3 bg-gray-700 rounded animate-pulse"
                    style={{ width: `${messageWidth}%` }}
                  />
                </div>
                <div className="ml-6 mt-1">
                  <div className="h-2 bg-gray-600 rounded animate-pulse w-12" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* DMs Section */}
      {showDMs && (
        <div className="p-2 border-t border-gray-800">
          <div className="px-2 py-1 mb-2">
            <div className="h-3 bg-gray-700 rounded animate-pulse w-24" />
          </div>
          {Array.from({ length: dmCount }).map((_, index) => {
            const pattern = DM_PATTERNS[index % DM_PATTERNS.length];
            const messageWidth = MESSAGE_WIDTHS[(index + 2) % MESSAGE_WIDTHS.length];

            return (
              <motion.div
                key={`dm-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (channelCount + index) * 0.05 }}
                className="w-full p-3 rounded-lg mb-1"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 bg-gray-700 rounded-full animate-pulse" />
                  <div
                    className="h-4 bg-gray-700 rounded animate-pulse flex-1"
                    style={{ width: `${pattern.nameWidth}px` }}
                  />
                  {pattern.hasStatus && (
                    <div className="w-3 h-3 bg-gray-600 rounded animate-pulse" />
                  )}
                  {pattern.hasUnread && (
                    <div className="h-4 bg-purple-600 rounded-full animate-pulse px-2" />
                  )}
                </div>
                <div className="ml-6">
                  <div
                    className="h-3 bg-gray-700 rounded animate-pulse"
                    style={{ width: `${messageWidth}%` }}
                  />
                </div>
                <div className="ml-6 mt-1">
                  <div className="h-2 bg-gray-600 rounded animate-pulse w-12" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </nav>
  );
}