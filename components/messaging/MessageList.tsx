"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  Message,
  ConversationParticipant,
} from "@/lib/supabase/messaging";
import { formatMentions } from "@/lib/utils/mentions";

interface MessageListProps {
  messages: Message[];
  participants: ConversationParticipant[];
  currentUserId: string;
  onMessageClick: (messageId: string) => void;
}

export function MessageList({
  messages,
  participants,
  currentUserId,
  onMessageClick,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getParticipantName = (userId: string) => {
    const participant = participants.find((p) => p.userId === userId);
    return participant?.fullname || participant?.email || "Unknown";
  };

  const getParticipantInitials = (userId: string) => {
    const name = getParticipantName(userId);
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 custom-scrollbar">
      <AnimatePresence>
        {messages.map((message, index) => {
          const isOwnMessage = message.authorId === currentUserId;
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar =
            !prevMessage || prevMessage.authorId !== message.authorId;

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`flex items-start gap-3 ${
                isOwnMessage ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              {showAvatar ? (
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0 mt-5">
                  {getParticipantInitials(message.authorId)}
                </div>
              ) : (
                <div className="w-8 flex-shrink-0" />
              )}

              {/* Message Content */}
              <div
                className={`flex flex-col max-w-[70%] ${
                  isOwnMessage ? "items-end" : "items-start"
                }`}
              >
                {/* Show name on every message */}
                {showAvatar && (
                  <div
                    className={`text-xs font-semibold mb-1 px-2 ${
                      isOwnMessage
                        ? "text-right text-purple-300"
                        : "text-left text-gray-400"
                    }`}
                  >
                    {isOwnMessage
                      ? "You"
                      : getParticipantName(message.authorId)}
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`px-4 py-2 rounded-2xl cursor-pointer ${
                    isOwnMessage
                      ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white rounded-tr-sm"
                      : "bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700"
                  }`}
                  onClick={() => onMessageClick(message.id)}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {formatMentions(
                      message.content,
                      participants.map((p) => ({
                        id: p.userId,
                        email: p.email,
                        fullname: p.fullname,
                      }))
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div
                  className={`text-[10px] text-gray-500 mt-1 px-2 ${
                    isOwnMessage ? "text-right" : "text-left"
                  }`}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>

                {/* Thread replies count */}
                {(message.threadReplyCount || 0) > 0 && (
                  <button
                    onClick={() => onMessageClick(message.id)}
                    className="text-xs text-purple-400 hover:text-purple-300 mt-1 px-2"
                  >
                    {message.threadReplyCount}{" "}
                    {message.threadReplyCount === 1 ? "reply" : "replies"}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={messagesEndRef} />
    </div>
  );
}
