"use client";

import { motion } from "motion/react";
import { X, Users, Bell, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { ConversationParticipant } from "@/lib/supabase/messaging";

interface EveryoneMentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message?: string) => void;
  participants: ConversationParticipant[];
  isLoading?: boolean;
}

export function EveryoneMentionModal({
  isOpen,
  onClose,
  onConfirm,
  participants,
  isLoading = false,
}: EveryoneMentionModalProps) {
  if (!isOpen) return null;

  const participantCount = participants.length;
  const canMention = participantCount > 0;

  const handleConfirm = () => {
    if (!canMention) {
      toast.error("No participants to mention");
      return;
    }

    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md mx-4"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="text-orange-400" size={24} />
            Mention Everyone
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-orange-400 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="text-orange-300 font-medium mb-1">Channel-wide notification</h3>
                <p className="text-orange-200/80 text-sm">
                  This will send a notification to all {participantCount} participant{participantCount !== 1 ? 's' : ''} in this channel.
                  Only use this for important announcements.
                </p>
              </div>
            </div>
          </div>

          {/* Participant count */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            <Users size={20} className="text-gray-400" />
            <div>
              <div className="text-white font-medium">
                {participantCount} participant{participantCount !== 1 ? 's' : ''} will be notified
              </div>
              <div className="text-gray-400 text-sm">
                {canMention
                  ? "All channel members except you"
                  : "No other participants in this channel"
                }
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2">Message preview:</div>
            <div className="text-white text-sm">
              <span className="font-bold text-orange-400 bg-orange-900/20 px-1 py-0.5 rounded">
                @everyone
              </span>
              {' '}[Your message will appear here]
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-300 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canMention || isLoading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {isLoading ? "Sending..." : `Notify ${participantCount} participant${participantCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
