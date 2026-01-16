"use client";

import { useState, useEffect, useRef } from "react";
import { Pin, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import type { PinnedMessage } from "@/lib/supabase/messaging";
import { getPinnedMessages, unpinMessage } from "@/lib/supabase/messaging";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PinnedMessagesPanelProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onMessageClick: (messageId: string) => void;
}

export function PinnedMessagesPanel({
  conversationId,
  isOpen,
  onClose,
  onMessageClick,
}: PinnedMessagesPanelProps) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  // Real-time subscription ref
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (isOpen && conversationId && loadedConversationId !== conversationId) {
      loadPinnedMessages();
      setupRealtimeSubscription();
    }
  }, [isOpen, conversationId, loadedConversationId]);

  // Listen for refresh events (fallback)
  useEffect(() => {
    const handleRefresh = () => {
      if (isOpen && conversationId) {
        loadPinnedMessages();
      }
    };

    window.addEventListener("refreshPinnedMessages", handleRefresh);
    return () => {
      window.removeEventListener("refreshPinnedMessages", handleRefresh);
    };
  }, [isOpen, conversationId]);

  // Set up real-time subscription for pinned messages
  const setupRealtimeSubscription = () => {
    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    // Create new subscription for this conversation
    const channel = supabase
      .channel(`pinned_messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pinned_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('[REALTIME] Pinned messages change:', payload);
          // Refresh pinned messages when any change occurs
          loadPinnedMessages();
        }
      )
      .subscribe((status) => {
        console.log(`[REALTIME] Pinned messages subscription status: ${status}`);
      });

    realtimeChannelRef.current = channel;
  };

  // Clean up subscription when component unmounts
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, []);

  const loadPinnedMessages = async () => {
    try {
      setIsLoading(true);
      const messages = await getPinnedMessages(conversationId);
      setPinnedMessages(messages);
      setLoadedConversationId(conversationId); // Cache the loaded conversation
    } catch (error) {
      console.error("Error loading pinned messages:", error);
      toast.error("Failed to load pinned messages");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnpin = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await unpinMessage(messageId);
      setPinnedMessages((prev) => prev.filter((pm) => pm.messageId !== messageId));
      toast.success("Message unpinned");
      // Trigger refresh of pinned message IDs in parent
      window.dispatchEvent(new CustomEvent("refreshPinnedMessageIds", {
        detail: { conversationId }
      }));
    } catch (error) {
      console.error("Error unpinning message:", error);
      toast.error("Failed to unpin message");
    }
  };

  const handleMessageClick = async (messageId: string) => {
    if (loadingMessageId) return; // Prevent multiple clicks

    setLoadingMessageId(messageId);

    try {
      // Add a small delay to show loading feedback
      await new Promise(resolve => setTimeout(resolve, 200));
      onMessageClick(messageId);
      onClose();
    } finally {
      setLoadingMessageId(null);
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
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-[90vw] max-h-[80vh] bg-gray-900 border border-gray-800 rounded-lg z-50 flex flex-col shadow-2xl"
          >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Pin size={20} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Pinned Messages</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded transition"
        >
          <X size={20} className="text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : pinnedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Pin size={48} className="mb-4 opacity-50" />
            <p className="text-sm">No pinned messages</p>
          </div>
        ) : (
          <div className="space-y-1">
            {pinnedMessages.map((pinned) => (
              <motion.div
                key={pinned.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800 rounded-lg p-2 border border-gray-700 hover:border-purple-500/50 transition cursor-pointer"
                onClick={() => handleMessageClick(pinned.messageId)}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {pinned.message.author.fullname || pinned.message.author.email}
                    </p>
                    <p className="text-xs text-gray-400">
                      {(() => {
                        try {
                          if (!pinned.message.createdAt) return "Unknown time";
                          const date = new Date(pinned.message.createdAt);
                          if (isNaN(date.getTime())) return "Invalid time";
                          return date.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return "Invalid time";
                        }
                      })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {loadingMessageId === pinned.messageId && (
                      <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => handleUnpin(pinned.messageId, e)}
                      disabled={loadingMessageId === pinned.messageId}
                      className="p-1 hover:bg-gray-700 rounded transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Unpin message"
                    >
                      <Pin size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-300 mb-1 whitespace-pre-wrap break-words">
                  {pinned.message.content || "No message content"}
                </p>
                <p className="text-xs text-gray-500">
                  Pinned by {pinned.pinnedBy.fullname || pinned.pinnedBy.email}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
