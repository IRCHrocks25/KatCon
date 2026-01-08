"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Reply, Pin, PinOff, Smile } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { pinMessage, unpinMessage } from "@/lib/supabase/messaging";
import { toast } from "sonner";

interface MessageActionsMenuProps {
  messageId: string;
  conversationId: string;
  isPinned?: boolean;
  isOwnMessage?: boolean; // Whether this is the current user's message
  onReply?: () => void;
  onPinChange?: () => void;
  onAddReaction?: () => void;
}

export function MessageActionsMenu({
  messageId,
  isPinned = false,
  isOwnMessage = false,
  onReply,
  onPinChange,
  onAddReaction,
}: MessageActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPinning, setIsPinning] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handlePin = async () => {
    if (isPinning) return;

    try {
      setIsPinning(true);
      if (isPinned) {
        await unpinMessage(messageId);
        toast.success("Message unpinned");
      } else {
        await pinMessage(messageId);
        toast.success("Message pinned");
      }
      onPinChange?.();
      setIsOpen(false);
    } catch (error) {
      console.error("Error pinning/unpinning message:", error);
      toast.error(`Failed to ${isPinned ? "unpin" : "pin"} message`);
    } finally {
      setIsPinning(false);
    }
  };

  const handleReply = () => {
    onReply?.();
    setIsOpen(false);
  };

  const handleAddReaction = () => {
    onAddReaction?.();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-gray-800 rounded transition"
        title="More options"
      >
        <MoreVertical size={16} className="text-gray-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            {/* Menu - Positioned on top, aligned based on message side */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`absolute bottom-full mb-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl min-w-[180px] ${
                isOwnMessage ? "right-0" : "left-0"
              }`}
            >
              <div className="py-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddReaction();
                  }}
                  onMouseDown={(e) => {
                    // Prevent any hover-related events from triggering
                    e.preventDefault();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2 transition"
                >
                  <Smile size={16} />
                  <span>Add reaction</span>
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleReply();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2 transition"
                >
                  <Reply size={16} />
                  <span>Reply</span>
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePin();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  disabled={isPinning}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPinned ? (
                    <>
                      <PinOff size={16} />
                      <span>Unpin message</span>
                    </>
                  ) : (
                    <>
                      <Pin size={16} />
                      <span>Pin message</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

