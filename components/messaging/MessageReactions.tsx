"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import type { MessageReaction } from "@/lib/supabase/messaging";
import {
  toggleMessageReaction,
  getMessageReactions,
} from "@/lib/supabase/messaging";
import { toast } from "sonner";

interface MessageReactionsProps {
  messageId: string;
  initialReactions?: MessageReaction[];
  onReactionsChange?: (reactions: MessageReaction[]) => void;
  trigger?: "menu" | "button"; // How the picker was triggered
  isOwnMessage?: boolean; // Whether this is the current user's message (for positioning)
  onPickerClose?: () => void; // Callback when picker closes
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🎉"];

export function MessageReactions({
  messageId,
  initialReactions = [],
  onReactionsChange,
  trigger = "button",
  isOwnMessage = false,
  onPickerClose,
}: MessageReactionsProps) {
  const [reactions, setReactions] = useState<MessageReaction[]>(
    initialReactions || []
  );
  const [isQuickPickerOpen, setIsQuickPickerOpen] = useState(false);
  const [isFullPickerOpen, setIsFullPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(
    initialReactions && initialReactions.length > 0
  );
  const quickPickerRef = useRef<HTMLDivElement>(null);
  const fullPickerRef = useRef<HTMLDivElement>(null);

  // Update reactions when initialReactions change
  useEffect(() => {
    if (initialReactions && initialReactions.length > 0) {
      setReactions(initialReactions);
      setHasFetched(true);
    }
  }, [initialReactions]);

  // Load reactions on mount if not already fetched
  // Only fetch if we don't have initial reactions (they should come from message fetch)
  useEffect(() => {
    // If initialReactions is provided (even if empty array), use them and mark as fetched
    // This means reactions were included in the message batch fetch
    if (initialReactions !== undefined && initialReactions !== null) {
      setReactions(initialReactions);
      setHasFetched(true);
      return;
    }

    // Only fetch if initialReactions was not provided at all (lazy load for edge cases)
    // This should rarely happen since reactions come with messages
    const loadReactions = async () => {
      if (hasFetched || isLoading || !messageId) return;

      try {
        setIsLoading(true);
        const fetchedReactions = await getMessageReactions(messageId);
        setReactions(fetchedReactions);
        setHasFetched(true);
        onReactionsChange?.(fetchedReactions);
      } catch (error) {
        console.error("Error fetching reactions on mount:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce to avoid thundering herd - only fetch after a short delay
    const timeoutId = setTimeout(() => {
      loadReactions();
    }, 100);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]); // Only depend on messageId to avoid re-fetching

  const handleReactionClick = useCallback(
    async (reactionType: string) => {
      if (isLoading) return;

      // Close pickers immediately for better UX
      setIsQuickPickerOpen(false);
      setIsFullPickerOpen(false);
      onPickerClose?.();

      try {
        setIsLoading(true);
        await toggleMessageReaction(messageId, reactionType);

        // Refresh reactions
        const updatedReactions = await getMessageReactions(messageId);
        setReactions(updatedReactions);
        setHasFetched(true);
        onReactionsChange?.(updatedReactions);
      } catch (error) {
        console.error("Error toggling reaction:", error);
        toast.error("Failed to update reaction");
      } finally {
        setIsLoading(false);
      }
    },
    [messageId, isLoading, onReactionsChange, onPickerClose]
  );

  const handleReactionButtonClick = useCallback(
    (reaction: MessageReaction) => {
      handleReactionClick(reaction.type);
    },
    [handleReactionClick]
  );

  // Lazy load reactions when user opens picker
  const handleShowReactions = useCallback(async () => {
    if (!hasFetched && !isLoading) {
      try {
        setIsLoading(true);
        const fetchedReactions = await getMessageReactions(messageId);
        setReactions(fetchedReactions);
        setHasFetched(true);
        onReactionsChange?.(fetchedReactions);
      } catch (error) {
        console.error("Error fetching reactions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    setIsQuickPickerOpen(true);
  }, [messageId, hasFetched, isLoading, onReactionsChange]);

  // Open full emoji picker
  const handleOpenFullPicker = useCallback(() => {
    setIsQuickPickerOpen(false);
    setIsFullPickerOpen(true);
  }, []);

  // Handle emoji selection from picker
  const handleEmojiClick = useCallback(
    async (emojiData: EmojiClickData) => {
      if (isLoading) return;

      // Close pickers immediately for better UX
      setIsQuickPickerOpen(false);
      setIsFullPickerOpen(false);
      onPickerClose?.();

      try {
        setIsLoading(true);
        await toggleMessageReaction(messageId, emojiData.emoji);

        // Refresh reactions
        const updatedReactions = await getMessageReactions(messageId);
        setReactions(updatedReactions);
        setHasFetched(true);
        onReactionsChange?.(updatedReactions);
      } catch (error) {
        console.error("Error toggling reaction:", error);
        toast.error("Failed to update reaction");
      } finally {
        setIsLoading(false);
      }
    },
    [messageId, isLoading, onReactionsChange, onPickerClose]
  );

  // Close pickers when clicking outside (backdrop handles most cases)
  // This is a fallback for clicks that somehow bypass the backdrop
  useEffect(() => {
    if (!isQuickPickerOpen && !isFullPickerOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is outside both pickers
      const isOutsideQuickPicker =
        quickPickerRef.current && !quickPickerRef.current.contains(target);
      const isOutsideFullPicker =
        fullPickerRef.current && !fullPickerRef.current.contains(target);

      // Close the appropriate picker if clicking outside
      if (isQuickPickerOpen && isOutsideQuickPicker) {
        setIsQuickPickerOpen(false);
        onPickerClose?.();
      }

      if (isFullPickerOpen && isOutsideFullPicker) {
        setIsFullPickerOpen(false);
        onPickerClose?.();
      }
    };

    // Use a small delay to ensure backdrop click is processed first
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isQuickPickerOpen, isFullPickerOpen, onPickerClose]);

  // Track previous trigger to detect changes
  const previousTriggerRef = useRef<"menu" | "button">(trigger);

  // Open quick picker when triggered from menu (only on explicit trigger change)
  useEffect(() => {
    const triggerChanged = previousTriggerRef.current !== trigger;
    previousTriggerRef.current = trigger;

    // Only open if trigger changed from "button" to "menu" (not on every render or hover)
    if (
      trigger === "menu" &&
      triggerChanged &&
      !isQuickPickerOpen &&
      !isLoading
    ) {
      handleShowReactions();
    }
  }, [trigger, isQuickPickerOpen, isLoading, handleShowReactions]);

  return (
    <div className="relative mt-1 flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {reactions.map((reaction) => (
        <button
          key={reaction.type}
          onClick={() => handleReactionButtonClick(reaction)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition ${
            reaction.currentUserReacted
              ? "bg-purple-600/30 text-purple-300 border border-purple-500/50"
              : "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700"
          }`}
          title={`${reaction.type} ${reaction.count} ${
            reaction.count === 1 ? "reaction" : "reactions"
          }`}
        >
          <span>{reaction.type}</span>
          <span>{reaction.count}</span>
        </button>
      ))}

      {/* Quick Reaction Picker - Shows 5 predefined emojis + plus button */}
      <AnimatePresence>
        {isQuickPickerOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onMouseDown={(e) => {
                // Only close if clicking directly on backdrop, not on picker
                if (quickPickerRef.current?.contains(e.target as Node)) {
                  return;
                }
                setIsQuickPickerOpen(false);
                onPickerClose?.();
              }}
              onClick={(e) => {
                // Also handle click events
                if (quickPickerRef.current?.contains(e.target as Node)) {
                  return;
                }
                setIsQuickPickerOpen(false);
                onPickerClose?.();
              }}
            />
            {/* Quick Picker */}
            <motion.div
              ref={quickPickerRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`absolute bottom-full mb-2 z-50 bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl ${
                isOwnMessage ? "right-0" : "left-0"
              }`}
              onClick={(e) => {
                // Prevent clicks inside the picker from closing it
                e.stopPropagation();
              }}
            >
              <div className="flex items-center gap-2">
                {/* 5 Quick Reaction Buttons */}
                {QUICK_REACTIONS.map((emoji) => {
                  const existingReaction = reactions.find(
                    (r) => r.type === emoji
                  );
                  const isActive = existingReaction?.currentUserReacted;

                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReactionClick(emoji)}
                      className={`p-2 rounded transition text-lg ${
                        isActive
                          ? "bg-purple-600/30 text-purple-300"
                          : "hover:bg-gray-800 text-gray-300"
                      }`}
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}

                {/* Plus button for custom emoji picker */}
                <button
                  onClick={handleOpenFullPicker}
                  className="p-2 rounded transition hover:bg-gray-800 text-gray-300 border border-gray-700"
                  title="More emojis"
                >
                  <Plus size={16} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Full Emoji Picker - Opens when plus button is clicked */}
      <AnimatePresence>
        {isFullPickerOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onMouseDown={(e) => {
                // Only close if clicking directly on backdrop, not on picker
                if (fullPickerRef.current?.contains(e.target as Node)) {
                  return;
                }
                setIsFullPickerOpen(false);
                onPickerClose?.();
              }}
              onClick={(e) => {
                // Also handle click events
                if (fullPickerRef.current?.contains(e.target as Node)) {
                  return;
                }
                setIsFullPickerOpen(false);
                onPickerClose?.();
              }}
            />
            {/* Full Picker */}
            <motion.div
              ref={fullPickerRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`absolute bottom-full mb-2 z-50 ${
                isOwnMessage ? "right-0" : "left-0"
              }`}
              onClick={(e) => {
                // Prevent clicks inside the picker from closing it
                e.stopPropagation();
              }}
            >
              <div className="emoji-picker-wrapper [&_.EmojiPickerReact]:!bg-gray-900 [&_.EmojiPickerReact]:!border-gray-700">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  // @ts-expect-error - theme type issue with emoji-picker-react
                  theme="dark"
                  width={350}
                  height={400}
                  searchDisabled={false}
                  skinTonesDisabled={false}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
