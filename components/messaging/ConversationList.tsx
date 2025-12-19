"use client";

import { motion } from "motion/react";
import { Hash, Users } from "lucide-react";
import type { Conversation } from "@/lib/supabase/messaging";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/ui/avatar";

interface ConversationListProps {
  readonly conversations: Conversation[];
  readonly activeConversationId: string | null;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onOpenChannelSettings?: (conversationId: string) => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenChannelSettings,
}: ConversationListProps) {
  const { user: currentUser } = useAuth();

  const getConversationName = (conversation: Conversation) => {
    if (conversation.name) {
      return conversation.name;
    }
    if (conversation.type === "dm") {
      const otherParticipant = conversation.participants.find(
        (p) => p.userId !== currentUser?.id
      );
      return (
        otherParticipant?.username ||
        otherParticipant?.fullname ||
        otherParticipant?.email ||
        "Unknown"
      );
    }
    return "Unnamed Channel";
  };

  const getOtherParticipant = (conversation: Conversation) => {
    return conversation.participants.find(
      (p) => p.userId !== currentUser?.id
    );
  };

  const getConversationPreview = (conversation: Conversation) => {
    if (conversation.lastMessage) {
      return conversation.lastMessage.content;
    }
    return "No messages yet";
  };

  const getConversationTime = (conversation: Conversation) => {
    if (conversation.lastMessage) {
      const date = new Date(conversation.lastMessage.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    }
    return "";
  };

  // Separate channels and DMs
  const channels = conversations.filter((c) => c.type === "channel");
  const dms = conversations.filter((c) => c.type === "dm");

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {/* Channels Section */}
      {channels.length > 0 && (
        <div className="p-2">
          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">
            Channels
          </div>
          {channels.map((conversation) => (
            <motion.button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full p-3 rounded-lg mb-1 text-left transition ${
                activeConversationId === conversation.id
                  ? "bg-purple-600/20 border border-purple-500/50"
                  : "hover:bg-gray-800/50"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Hash size={16} className="text-gray-400 shrink-0" />
                <span className="text-white font-medium truncate flex-1">
                  {getConversationName(conversation)}
                </span>
                {onOpenChannelSettings && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="text-gray-500 hover:text-gray-300 px-1 text-xs cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChannelSettings(conversation.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenChannelSettings(conversation.id);
                      }
                    }}
                    title="Channel settings"
                  >
                    ⋯
                  </span>
                )}
                {/* Visibility / join badges */}
                {!conversation.isPrivate && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-500/60 text-purple-300 mr-1">
                    Public
                  </span>
                )}
                {conversation.type === "channel" &&
                  conversation.isJoined === false && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-600 text-white mr-1">
                      Not joined
                    </span>
                  )}
                {Number(conversation.unreadCount || 0) > 0 && (
                  <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full shrink-0">
                    {(conversation.unreadCount || 0) > 99
                      ? "99+"
                      : conversation.unreadCount || 0}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate ml-6">
                {getConversationPreview(conversation)}
              </div>
              <div className="text-xs text-gray-500 ml-6 mt-1">
                {getConversationTime(conversation)}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* DMs Section */}
      {dms.length > 0 && (
        <div className="p-2 border-t border-gray-800">
          <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">
            Direct Messages
          </div>
          {dms.map((conversation) => (
            <motion.button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full p-3 rounded-lg mb-1 text-left transition ${
                activeConversationId === conversation.id
                  ? "bg-purple-600/20 border border-purple-500/50"
                  : "hover:bg-gray-800/50"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-2 mb-1">
                {(() => {
                  const otherParticipant = getOtherParticipant(conversation);
                  return (
                    <Avatar
                      src={otherParticipant?.avatarUrl || null}
                      name={
                        otherParticipant?.username ||
                        otherParticipant?.fullname ||
                        undefined
                      }
                      email={otherParticipant?.email || undefined}
                      size="sm"
                    />
                  );
                })()}
                <span className="text-white font-medium truncate flex-1">
                  {getConversationName(conversation)}
                </span>
                {Number(conversation.unreadCount || 0) > 0 && (
                  <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full shrink-0">
                    {(conversation.unreadCount || 0) > 99
                      ? "99+"
                      : conversation.unreadCount || 0}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate ml-6">
                {getConversationPreview(conversation)}
              </div>
              <div className="text-xs text-gray-500 ml-6 mt-1">
                {getConversationTime(conversation)}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {conversations.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-400 p-4">
          <div className="text-center">
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start a new conversation</p>
          </div>
        </div>
      )}
    </div>
  );
}
