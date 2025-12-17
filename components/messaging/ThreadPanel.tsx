"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { Message, ConversationParticipant } from "@/lib/supabase/messaging";
import { formatMentions } from "@/lib/utils/mentions";
import { MessageInput } from "./MessageInput";

interface ThreadPanelProps {
  parentMessage: Message | undefined;
  threadMessages: Message[];
  participants: ConversationParticipant[];
  currentUserId: string;
  onClose: () => void;
  onSendReply: (content: string) => void;
  isLoading: boolean;
}

export function ThreadPanel({
  parentMessage,
  threadMessages,
  participants,
  currentUserId,
  onClose,
  onSendReply,
  isLoading,
}: ThreadPanelProps) {
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

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

  if (!parentMessage) return null;

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex">
      <div className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-white font-medium">Thread</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Parent Message */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
              {getParticipantInitials(parentMessage.authorId)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium text-sm">
                  {getParticipantName(parentMessage.authorId)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(parentMessage.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm">
                {formatMentions(parentMessage.content, participants)}
              </div>
            </div>
          </div>
        </div>

        {/* Thread Replies */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {threadMessages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p className="text-sm">No replies yet</p>
            </div>
          ) : (
            threadMessages.map((message) => {
              const isOwnMessage = message.authorId === currentUserId;
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {getParticipantInitials(message.authorId)}
                  </div>
                  <div
                    className={`flex flex-col max-w-[80%] ${isOwnMessage ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white text-xs font-medium">
                        {getParticipantName(message.authorId)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div
                      className={`px-3 py-2 rounded-lg text-sm ${
                        isOwnMessage
                          ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 text-white"
                          : "bg-gray-800 text-gray-100 border border-gray-700"
                      }`}
                    >
                      {formatMentions(message.content, participants)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Reply Input */}
        <div className="border-t border-gray-800">
          <MessageInput
            onSend={onSendReply}
            isLoading={isLoading}
            participants={participants}
          />
        </div>
      </div>
    </div>
  );
}

