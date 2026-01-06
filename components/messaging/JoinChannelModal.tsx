"use client";

import { motion, AnimatePresence } from "motion/react";
import { Hash, Users, Lock } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/lib/supabase/messaging";

interface JoinChannelModalProps {
  isOpen: boolean;
  channel: Conversation | null;
  onClose: () => void;
  onJoin: (channelId: string) => Promise<void>;
  isJoining?: boolean;
}

export function JoinChannelModal({
  isOpen,
  channel,
  onClose,
  onJoin,
  isJoining = false,
}: JoinChannelModalProps) {
  if (!channel) return null;

  const handleJoin = async () => {
    try {
      await onJoin(channel.id);
      toast.success(`Joined #${channel.name || "channel"}`);
      onClose();
    } catch (error) {
      console.error("Error joining channel:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to join channel"
      );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                  <Hash size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Join Channel
                  </h2>
                  <p className="text-sm text-gray-400">
                    Join a public channel to start participating
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center shrink-0">
                  <Hash size={16} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-white truncate">
                      #{channel.name || "Unnamed Channel"}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-purple-500/60 text-purple-300 shrink-0">
                      Public
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-2">
                    {channel.description || "No description available"}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {channel.participants?.length || 0} members
                    </span>
                    {!channel.isPrivate && (
                      <span className="flex items-center gap-1">
                        <Lock size={12} />
                        Public channel
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-400 mt-4">
                By joining this channel, you'll be able to:
              </p>
              <ul className="text-sm text-gray-400 mt-2 space-y-1 ml-4">
                <li>• View and participate in conversations</li>
                <li>• Create and manage tasks</li>
                <li>• Access shared files and resources</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={onClose}
                disabled={isJoining}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isJoining ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Join Channel"
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
